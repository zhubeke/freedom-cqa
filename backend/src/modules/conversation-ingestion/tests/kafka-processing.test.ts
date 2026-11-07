import assert from "node:assert/strict";
import test from "node:test";
import { processImport } from "../application/process-import.js";

test("processes persisted payload and emits an ingested event", async () => {
  const document = {
    import_id: "i1", dataset_group_id: "DEV", event_id: "e1", status: "queued", processed_count: 0,
    original_payload: { error: "", isSuccess: true, data: { dataset_group_id: "DEV", total_records: 1, records: [{
      conversation_id: "c1", channel: "agent chat", language: "EN", audio_url: null,
      transcript: [{ timestamp: "00:00", speaker: "client", text: "Hello" }]
    }] } }
  };
  const updates: unknown[] = [];
  const imports = { collection: () => ({
    findOneAndUpdate: async () => ({ ...document, status: "processing" }),
    updateOne: async (...args: unknown[]) => { updates.push(args); }
  }) };
  const saved: unknown[] = [];
  const conversations = { upsertComplete: async (item: unknown) => { saved.push(item); } };
  const sent: unknown[] = [];
  const producer = { send: async (event: unknown) => { sent.push(event); } };
  await processImport("i1", imports as never, conversations as never, producer as never);
  assert.equal(saved.length, 1);
  assert.equal(sent.length, 1);
  assert.equal((sent[0] as { topic: string }).topic, "cqa.conversation.ingested.v1");
  assert.equal(updates.length, 2);
});
