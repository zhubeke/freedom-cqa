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

test("explicit metadata reanalysis preserves results and cannot be reset by duplicate dispatch", async () => {
  const updates: any[] = [];
  let current: any = { current_event_id: "older", deterministic_status: "completed", semantic_status: "completed" };
  const repository = new MetadataRepository({ collection: (name: string) => name === "metadata_analysis_history" ? { updateOne: async () => ({ upsertedCount: 1 }) } : ({
    findOne: async () => current,
    updateOne: async (_filter: unknown, update: any) => { updates.push(update); current = { ...current, ...update.$set }; return { matchedCount: 1 }; }
  }) } as never);
  await repository.queue("DEV", "c1", "v1", "fresh-event", false, true);
  assert.equal(updates[0].$set.semantic_status, "pending");
  assert.equal("semantic" in updates[0].$set, false);
  await repository.queue("DEV", "c1", "v1", "fresh-event", false, true);
  assert.equal(updates.length, 1);
  assert.equal(await repository.alreadyProcessed("DEV", "c1", "v1", "older"), true);
  assert.equal(await repository.alreadyProcessed("DEV", "c1", "v1", "fresh-event"), false);
});

test("a completed metadata generation remains readable after a manual rerun replaces the current event", async () => {
  const history = new Map<string, unknown>();
  let current: any = { dataset_group_id: "DEV", conversation_id: "c1", current_event_id: "completed-event", deterministic_status: "completed", semantic_status: "completed", errors: [], semantic: { primary_intent: "Saved result" } };
  const repository = new MetadataRepository({ collection: (name: string) => name === "metadata_analysis_history" ? {
    updateOne: async (filter: any, update: any) => { history.set(filter._id, update.$setOnInsert); },
    findOne: async (filter: any) => history.get(filter._id) ?? null
  } : {
    findOne: async () => current,
    updateOne: async (_filter: unknown, update: any) => { current = { ...current, ...update.$set }; return { matchedCount: 1 }; }
  } } as never);
  assert.equal(await repository.queue("DEV", "c1", "v1", "new-event", false, true), true);
  const old = await repository.generation("DEV", "c1", "completed-event");
  assert.equal(old?.semantic_status, "completed");
  assert.equal(old?.current_event_id, "completed-event");
  assert.equal((old?.semantic as any).primary_intent, "Saved result");
  assert.equal((await repository.generation("DEV", "c1", "new-event"))?.semantic_status, "pending");
});
