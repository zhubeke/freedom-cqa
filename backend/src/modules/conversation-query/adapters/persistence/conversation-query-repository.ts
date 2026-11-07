import type { Db, Filter } from "mongodb";

interface QueryOptions {
  page: number;
  pageSize: number;
  search?: string;
  language?: string;
  channel?: string;
  datasetGroupId?: string;
  action?: string;
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export class ConversationQueryRepository {
  constructor(private readonly db: Db) {}

  async list(options: QueryOptions) {
    const filter: Filter<Record<string, unknown>> = {};
    if (options.datasetGroupId) filter.dataset_group_id = options.datasetGroupId;
    if (options.language) filter.normalized_language = options.language.toLowerCase() === "kz" ? "kk" : options.language.toLowerCase();
    if (options.channel) filter.normalized_channel = options.channel;
    if (options.search) {
      filter.conversation_id = { $regex: escapeRegex(options.search), $options: "i" };
    }
    if (options.action) {
      const latest = await this.db.collection("classification_results").aggregate([
        { $match: { status: { $in: ["completed", "fallback"] } } }, { $sort: { created_at: -1 } },
        { $group: { _id: { dataset_group_id: "$dataset_group_id", conversation_id: "$conversation_id" }, action: { $first: "$final_action" } } },
        { $match: { action: options.action } }
      ]).toArray();
      const matchingIdentities = latest.map((item) => ({
        dataset_group_id: item._id.dataset_group_id,
        conversation_id: item._id.conversation_id
      }));
      // MongoDB rejects `$or: []`. An empty `$in` is valid and deliberately
      // produces an empty result without overwriting a combined search filter.
      if (matchingIdentities.length) filter.$or = matchingIdentities;
      else filter.$and = [{ conversation_id: { $in: [] } }];
    }
    const collection = this.db.collection("conversations");
    const [items, total] = await Promise.all([
      collection.find(filter, {
        projection: { _id: 0, audio_url: 0, transcript: 0 }
      }).sort({ conversation_id: 1 }).skip((options.page - 1) * options.pageSize).limit(options.pageSize).toArray(),
      collection.countDocuments(filter)
    ]);
    const identities = items.map((item) => ({ dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }));
    const [actions, scores] = identities.length ? await Promise.all([
      this.db.collection("classification_results").aggregate([{ $match: { $or: identities, status: { $in: ["completed", "fallback", "queued", "processing"] } } }, { $sort: { created_at: -1 } }, { $group: { _id: { dataset_group_id: "$dataset_group_id", conversation_id: "$conversation_id" }, item: { $first: "$$ROOT" } } }]).toArray(),
      this.db.collection("evaluation_runs").aggregate([{ $match: { $or: identities, status: "completed" } }, { $sort: { completed_at: -1 } }, { $group: { _id: { dataset_group_id: "$dataset_group_id", conversation_id: "$conversation_id" }, item: { $first: "$$ROOT" } } }]).toArray()
    ]) : [[], []];
    const key = (group: unknown, conversation: unknown) => `${String(group)}:${String(conversation)}`;
    const actionMap = new Map(actions.map((entry: any) => [key(entry._id.dataset_group_id, entry._id.conversation_id), entry.item]));
    const scoreMap = new Map(scores.map((entry: any) => [key(entry._id.dataset_group_id, entry._id.conversation_id), entry.item.final_score]));
    return {
      items: items.map((item) => { const action: any = actionMap.get(key(item.dataset_group_id, item.conversation_id)); return { ...item, quality_score: scoreMap.get(key(item.dataset_group_id, item.conversation_id)) ?? null, recommended_action: action?.final_action ?? null, classification_source: action?.classification_source ?? null, classification_status: action?.status ?? "pending" }; }),
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize)
      }
    };
  }

  findById(id: string, datasetGroupId?: string) {
    return this.db.collection("conversations").findOne(
      { conversation_id: id, ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) },
      { projection: { _id: 0, audio_url: 0 } }
    );
  }
}
