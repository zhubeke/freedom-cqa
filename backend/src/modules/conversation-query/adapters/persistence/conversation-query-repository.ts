import type { Db, Filter } from "mongodb";
import { extractOperatorNames } from "../../../conversation-metadata/application/extract-operator-names.js";
import type { ConversationSortKey } from "../../application/list-conversations.js";

interface QueryOptions {
  page: number;
  pageSize: number;
  search?: string;
  language?: string;
  channel?: string;
  datasetGroupId?: string;
  action?: string;
  lifecycle?: "active" | "archived" | "deleted" | "all";
  sortBy?: ConversationSortKey;
  sortDirection?: "asc" | "desc";
}
interface ConversationListRecord extends Record<string, unknown> {
  conversation_id: string;
  dataset_group_id: string;
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const sortFields: Record<ConversationSortKey, string> = {
  conversation_id: "conversation_id", channel: "normalized_channel", duration: "duration_ms", language: "normalized_language",
  score: "quality_score", status: "evaluation_status", action: "recommended_action"
};
export function compareConversationRows(left: Record<string, unknown>, right: Record<string, unknown>, sortBy: ConversationSortKey, direction: "asc" | "desc"): number {
  const a = left[sortFields[sortBy]], b = right[sortFields[sortBy]];
  // Unknown scores/durations/actions stay at the end in either direction.
  if (a == null && b != null) return 1;
  if (a != null && b == null) return -1;
  const compared = a == null && b == null ? 0 : typeof a === "number" && typeof b === "number" ? a - b
    : String(a).localeCompare(String(b), "en", { numeric: true });
  return compared ? compared * (direction === "desc" ? -1 : 1)
    : String(left.conversation_id).localeCompare(String(right.conversation_id), "en", { numeric: true })
      || String(left.dataset_group_id).localeCompare(String(right.dataset_group_id));
}

export class ConversationQueryRepository {
  constructor(private readonly db: Db) {}

  async list(options: QueryOptions) {
    const filter: Filter<Record<string, unknown>> = {};
    if (options.lifecycle === "archived") {
      filter.archived_at = { $ne: null };
      filter.deleted_at = null;
    } else if (options.lifecycle === "deleted") filter.deleted_at = { $ne: null };
    else if (options.lifecycle !== "all") {
      filter.archived_at = null;
      filter.deleted_at = null;
    }
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
    const collection = this.db.collection<ConversationListRecord>("conversations");
    const sortBy = options.sortBy ?? "conversation_id";
    const direction = options.sortDirection ?? "asc";
    const enrichedSort = ["score", "status", "action"].includes(sortBy);
    const cursor = collection.find(filter, { projection: { _id: 0, audio_url: 0, transcript: 0 } })
      .sort({ [enrichedSort ? "conversation_id" : sortFields[sortBy]]: direction === "desc" ? -1 : 1,
        ...(sortBy !== "conversation_id" ? { conversation_id: 1 as const } : {}), dataset_group_id: 1 });
    // Joined columns must be sorted across the entire filtered set before slicing a page.
    // Ordinary transcript columns retain database pagination and avoid loading full transcripts.
    const [items, total] = await Promise.all([
      (enrichedSort ? cursor : cursor.skip((options.page - 1) * options.pageSize).limit(options.pageSize)).toArray(),
      collection.countDocuments(filter)
    ]);
    const identities = items.map((item) => ({ dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }));
    const groupLatest = { $group: { _id: { dataset_group_id: "$dataset_group_id", conversation_id: "$conversation_id" }, item: { $first: "$$ROOT" } } };
    const [actions, successfulActions, scores, statuses] = identities.length ? await Promise.all([
      this.db.collection("classification_results").aggregate([{ $match: { $or: identities } }, { $sort: { created_at: -1 } }, groupLatest]).toArray(),
      this.db.collection("classification_results").aggregate([{ $match: { $or: identities, status: { $in: ["completed", "fallback"] } } }, { $sort: { created_at: -1 } }, groupLatest]).toArray(),
      this.db.collection("evaluation_runs").aggregate([{ $match: { $or: identities, status: "completed" } }, { $sort: { finalized_at: -1, completed_at: -1, requested_at: -1 } }, groupLatest]).toArray(),
      this.db.collection("evaluation_runs").aggregate([{ $match: { $or: identities } }, { $sort: { requested_at: -1 } }, groupLatest]).toArray()
    ]) : [[], [], [], []];
    const key = (group: unknown, conversation: unknown) => JSON.stringify([group, conversation]);
    const asMap = (rows: Array<Record<string, any>>) => new Map(rows.map(entry => [key(entry._id.dataset_group_id, entry._id.conversation_id), entry.item]));
    const actionMap = asMap(actions), successfulActionMap = asMap(successfulActions), scoreMap = asMap(scores), statusMap = asMap(statuses);
    const enriched = items.map(item => {
      const identity = key(item.dataset_group_id, item.conversation_id);
      const action = successfulActionMap.get(identity), score = scoreMap.get(identity), status = statusMap.get(identity);
      return { ...item, quality_score: score?.finalized_at ? score.finalized_score ?? null : score?.final_score ?? null,
        critical_flag: score?.finalized_at ? score.finalized_critical_flag ?? null : score?.critical_flag ?? null,
        score_reviewed: Boolean(score?.finalized_at), evaluation_status: status?.status ?? "pending",
        recommended_action: action?.final_action ?? null, classification_source: action?.classification_source ?? null,
        classification_status: actionMap.get(identity)?.status ?? "pending" };
    });
    if (enrichedSort) enriched.sort((a, b) => compareConversationRows(a, b, sortBy, direction));
    return {
      items: enrichedSort ? enriched.slice((options.page - 1) * options.pageSize, options.page * options.pageSize) : enriched,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize)
      }
    };
  }

  async findById(id: string, datasetGroupId?: string) {
    const collection = this.db.collection("conversations");
    const item = await collection.findOne(
      { conversation_id: id, ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) },
      { projection: { _id: 0, audio_url: 0 } }
    );
    if (!item) return null;
    if (!Array.isArray(item.operator_names)) {
      const names = extractOperatorNames(item.transcript ?? [], item.operator_name ?? item.operators ?? []);
      await collection.updateOne(
        { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id },
        { $set: { operator_names: names, operator_names_extracted_at: new Date() } }
      );
      item.operator_names = names;
    }
    return item;
  }

  async mutateLifecycle(identities: Array<{ dataset_group_id?: string; conversation_id: string }>, action: "archive" | "unarchive" | "delete" | "restore") {
    const results = await Promise.all(identities.map(async (identity) => {
      const filter = { conversation_id: identity.conversation_id, ...(identity.dataset_group_id ? { dataset_group_id: identity.dataset_group_id } : {}) };
      const now = new Date();
      const update = action === "archive" ? { $set: { archived_at: now }, $unset: { deleted_at: "" } }
        : action === "unarchive" ? { $unset: { archived_at: "" } }
        : action === "delete" ? { $set: { deleted_at: now }, $unset: { archived_at: "" } }
        : { $unset: { deleted_at: "", archived_at: "" } };
      const outcome = await this.db.collection("conversations").updateOne(filter, update);
      return { ...identity, ok: outcome.matchedCount === 1, error: outcome.matchedCount ? null : "Conversation not found" };
    }));
    return { requested: identities.length, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok) };
  }
}
