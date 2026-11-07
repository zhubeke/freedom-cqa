import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateDataset, DatasetValidationError } from "../schemas/dataset.js";

test("validates the real fixture and its acceptance counts", async () => {
  const payload = JSON.parse(await readFile(new URL("../../../../../data/fixtures/invoke.json", import.meta.url), "utf8"));
  const dataset = validateDataset(payload);
  assert.equal(dataset.data.records.length, 65);
  assert.equal(dataset.data.records.reduce((sum, record) => sum + record.transcript.length, 0), 1268);
  assert.equal(dataset.data.records[0]?.conversation_id, "p1-ru-001");
  assert.equal(dataset.data.records[0]?.transcript.length, 12);
});

test("rejects mismatched counts and channel-specific timestamps", () => {
  const payload = { error: "", isSuccess: true, data: { dataset_group_id: "X", total_records: 2, records: [] } };
  assert.throws(() => validateDataset(payload), DatasetValidationError);
});
