import assert from "node:assert/strict";
import test from "node:test";
import { ConversationRepository } from "../adapters/persistence/conversation-repository.js";

test("uses a unique dataset/conversation key and idempotent upsert", async () => {
  const calls: unknown[] = [];
  const collection = {
    createIndex: async (...args: unknown[]) => { calls.push(["index", ...args]); },
    updateOne: async (...args: unknown[]) => { calls.push(["upsert", ...args]); }
  };
  const db = { collection: () => collection };
  const repository = new ConversationRepository(db as never);
  await repository.ensureIndexes();
  const conversation = { dataset_group_id: "DEV", conversation_id: "one", message_count: 2, created_at: new Date() };
  await repository.upsertComplete(conversation);
  await repository.upsertComplete(conversation);
  assert.equal(calls.filter((call) => (call as unknown[])[0] === "upsert").length, 2);
  assert.deepEqual((calls[0] as unknown[])[1], { dataset_group_id: 1, conversation_id: 1 });
  assert.equal(((calls[0] as unknown[])[2] as { unique: boolean }).unique, true);
  assert.equal((((calls[1] as unknown[])[3]) as { upsert: boolean }).upsert, true);
});
