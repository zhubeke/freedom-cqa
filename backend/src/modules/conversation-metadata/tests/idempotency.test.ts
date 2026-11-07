import assert from "node:assert/strict";
import test from "node:test";
import { MetadataRepository } from "../adapters/persistence/metadata-repository.js";

test("duplicate metadata events target one versioned active record", async () => {
  const indexes: Array<{ keys: unknown; options: unknown }> = [];
  const updates: unknown[][] = [];
  const collection = {
    createIndex: async (keys: unknown, options: unknown) => { indexes.push({ keys, options }); },
    updateOne: async (...args: unknown[]) => { updates.push(args); }
  };
  const db = { collection: () => collection };
  const repository = new MetadataRepository(db as never);
  await repository.ensureIndexes();
  await repository.queue("DEV", "c1", "v1", "same-event", false);
  await repository.queue("DEV", "c1", "v1", "same-event", false);
  assert.deepEqual(indexes[0]?.keys, { dataset_group_id: 1, conversation_id: 1, extractor_version: 1 });
  assert.equal((indexes[0]?.options as { unique: boolean }).unique, true);
  assert.deepEqual(updates[0]?.[0], updates[1]?.[0]);
  assert.equal((updates[0]?.[2] as { upsert: boolean }).upsert, true);
});
