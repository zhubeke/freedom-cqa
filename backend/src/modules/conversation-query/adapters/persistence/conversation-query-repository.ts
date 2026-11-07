import type { Db, Filter } from "mongodb";

interface QueryOptions {
  page: number;
  pageSize: number;
  search?: string;
  language?: string;
  channel?: string;
  datasetGroupId?: string;
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
    const collection = this.db.collection("conversations");
    const [items, total] = await Promise.all([
      collection.find(filter, {
        projection: { _id: 0, audio_url: 0, transcript: 0 }
      }).sort({ conversation_id: 1 }).skip((options.page - 1) * options.pageSize).limit(options.pageSize).toArray(),
      collection.countDocuments(filter)
    ]);
    return {
      items,
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
