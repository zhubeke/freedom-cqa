import assert from "node:assert/strict";
import test from "node:test";
import { startEvaluation } from "../application/start-evaluation.js";

test("defaults to the active eight-criterion Freedom checklist", async () => {
  const criteria = Array.from({ length: 8 }, () => ({ enabled: true }));
  let checklistFilter: unknown;
  const db = { collection: (name: string) => ({
    findOne: async (filter: unknown) => {
      if (name === "conversations") return { conversation_id: "p1-ru-001", dataset_group_id: "DEV" };
      if (name === "checklists") { checklistFilter = filter; return { _id: "freedom-default-checklist", active_version_id: "version-1" }; }
      if (name === "checklist_versions") return { _id: "version-1", checklist_id: "freedom-default-checklist", criteria };
      return null;
    }
  }) };
  let created: Record<string, unknown> | undefined;
  const repository = {
    activeDuplicate: async () => null,
    createRun: async (input: Record<string, unknown>) => { created = input; return { run_id: "run-1", ...input }; }
  };
  const result = await startEvaluation(db as never, repository as never, "p1-ru-001");
  assert.deepEqual(checklistFilter, { _id: "freedom-default-checklist", active_version_id: { $ne: null } });
  assert.equal(created?.checklist_version_id, "version-1");
  assert.equal(created?.total_criteria, 8);
  assert.equal(result.duplicate, false);
});
