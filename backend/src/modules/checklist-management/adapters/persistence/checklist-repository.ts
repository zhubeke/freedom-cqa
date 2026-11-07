import { randomUUID } from "node:crypto";
import { MongoServerError, type Db } from "mongodb";
import {
  ChecklistError,
  type ChecklistConfiguration,
  type ChecklistRecord,
  type ChecklistRepository,
  type ChecklistSummary,
  type ChecklistVersionRecord
} from "../../domain/checklist.types.js";
import { validateConfiguration } from "../../domain/checklist.validation.js";

interface ChecklistDocument {
  _id: string;
  name: string;
  description: string;
  active_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ChecklistVersionDocument extends ChecklistConfiguration {
  _id: string;
  checklist_id: string;
  version_number: number;
  created_at: Date;
  created_from_version_id: string | null;
  total_scoring_weight: number;
  schema_version: number;
}

const cloneConfiguration = (configuration: ChecklistConfiguration): ChecklistConfiguration => structuredClone(configuration);
const mapChecklist = ({ _id, ...document }: ChecklistDocument): ChecklistRecord => ({ id: _id, ...document });
const mapVersion = ({ _id, ...document }: ChecklistVersionDocument): ChecklistVersionRecord => ({ id: _id, ...document });

export class MongoChecklistRepository implements ChecklistRepository {
  private readonly checklists;
  private readonly versions;

  constructor(private readonly db: Db) {
    this.checklists = db.collection<ChecklistDocument>("checklists");
    this.versions = db.collection<ChecklistVersionDocument>("checklist_versions");
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.checklists.createIndex({ name: 1 }, { unique: true, name: "checklists_name_unique" }),
      this.versions.createIndex({ checklist_id: 1, version_number: 1 }, { unique: true, name: "checklist_version_number_unique" }),
      this.versions.createIndex({ checklist_id: 1, created_at: -1 }, { name: "checklist_versions_history" })
    ]);
  }

  async list(): Promise<ChecklistSummary[]> {
    const documents = await this.checklists.aggregate<ChecklistSummary>([
      { $lookup: { from: "checklist_versions", localField: "active_version_id", foreignField: "_id", as: "active" } },
      { $set: {
        id: "$_id",
        active_version_number: { $ifNull: [{ $first: "$active.version_number" }, null] },
        criterion_count: { $size: { $ifNull: [{ $first: "$active.criteria" }, []] } },
        total_scoring_weight: { $ifNull: [{ $first: "$active.total_scoring_weight" }, 0] }
      } },
      { $project: { _id: 0, active: 0 } },
      { $sort: { updated_at: -1 } }
    ]).toArray();
    return documents;
  }

  async findChecklist(id: string): Promise<ChecklistRecord | null> {
    const item = await this.checklists.findOne({ _id: id });
    return item ? mapChecklist(item) : null;
  }

  async findVersion(checklistId: string, versionId: string): Promise<ChecklistVersionRecord | null> {
    const item = await this.versions.findOne({ _id: versionId, checklist_id: checklistId });
    return item ? mapVersion(item) : null;
  }

  async listVersions(checklistId: string): Promise<ChecklistVersionRecord[]> {
    return (await this.versions.find({ checklist_id: checklistId }).sort({ version_number: -1 }).toArray()).map(mapVersion);
  }

  async createChecklist(input: { id?: string; name: string; description: string; configuration: ChecklistConfiguration }): Promise<{ checklist: ChecklistRecord; version: ChecklistVersionRecord }> {
    const now = new Date();
    const checklistId = input.id ?? randomUUID();
    const versionId = randomUUID();
    const checklist: ChecklistDocument = { _id: checklistId, name: input.name, description: input.description, active_version_id: versionId, created_at: now, updated_at: now };
    const version: ChecklistVersionDocument = {
      _id: versionId, checklist_id: checklistId, version_number: 1, created_at: now, created_from_version_id: null,
      ...cloneConfiguration(input.configuration), total_scoring_weight: validateConfiguration(input.configuration), schema_version: 1
    };
    try {
      await this.checklists.insertOne(checklist);
      try { await this.versions.insertOne(version); }
      catch (error) { await this.checklists.deleteOne({ _id: checklistId }); throw error; }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new ChecklistError("A checklist with this name already exists", 409, "CHECKLIST_ALREADY_EXISTS");
      throw error;
    }
    return { checklist: mapChecklist(checklist), version: mapVersion(version) };
  }

  async createVersion(input: { checklistId: string; createdFromVersionId: string; name: string; description: string; configuration: ChecklistConfiguration }): Promise<ChecklistVersionRecord> {
    const [checklist, source, latest] = await Promise.all([
      this.checklists.findOne({ _id: input.checklistId }),
      this.versions.findOne({ _id: input.createdFromVersionId, checklist_id: input.checklistId }),
      this.versions.find({ checklist_id: input.checklistId }).sort({ version_number: -1 }).limit(1).next()
    ]);
    if (!checklist) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
    if (!source) throw new ChecklistError("Created-from version is invalid", 400, "INVALID_VERSION_REFERENCE");
    const now = new Date();
    const version: ChecklistVersionDocument = {
      _id: randomUUID(), checklist_id: input.checklistId, version_number: (latest?.version_number ?? 0) + 1,
      created_at: now, created_from_version_id: source._id, ...cloneConfiguration(input.configuration),
      total_scoring_weight: validateConfiguration(input.configuration), schema_version: 1
    };
    try { await this.versions.insertOne(version); }
    catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new ChecklistError("The checklist changed concurrently; reload and save again", 409, "CONCURRENT_CHANGE");
      throw error;
    }
    try {
      await this.checklists.updateOne({ _id: input.checklistId }, { $set: { name: input.name, description: input.description, updated_at: now } });
    } catch (error) {
      await this.versions.deleteOne({ _id: version._id });
      throw error;
    }
    return mapVersion(version);
  }

  async activateVersion(input: { checklistId: string; versionId: string; expectedActiveVersionId: string | null }): Promise<ChecklistRecord> {
    if (!await this.versions.findOne({ _id: input.versionId, checklist_id: input.checklistId })) {
      throw new ChecklistError("Version does not belong to this checklist", 400, "INVALID_VERSION_REFERENCE");
    }
    const updated = await this.checklists.findOneAndUpdate(
      { _id: input.checklistId, active_version_id: input.expectedActiveVersionId },
      { $set: { active_version_id: input.versionId, updated_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) {
      if (!await this.checklists.findOne({ _id: input.checklistId })) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
      throw new ChecklistError("The active version changed concurrently; reload and try again", 409, "CONCURRENT_CHANGE");
    }
    return mapChecklist(updated);
  }
}
