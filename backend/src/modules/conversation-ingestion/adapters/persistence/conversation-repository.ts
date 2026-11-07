import type { Db } from "mongodb";

export class ConversationRepository {
  constructor(private readonly db: Db) {}

  async ensureIndexes(): Promise<void> {
    await this.db.collection("conversations").createIndex(
      { dataset_group_id: 1, conversation_id: 1 },
      { unique: true, name: "dataset_conversation_unique" }
    );
  }

  async upsertComplete(conversation: Record<string, unknown>): Promise<void> {
    const filter = {
      dataset_group_id: conversation.dataset_group_id,
      conversation_id: conversation.conversation_id,
      $or: [
        { message_count: { $exists: false } },
        { message_count: { $lte: conversation.message_count } }
      ]
    };
    const { created_at, ...mutable } = conversation;
    await this.db.collection("conversations").updateOne(filter, {
      $set: mutable,
      $setOnInsert: { created_at }
    }, { upsert: true });
  }
}
