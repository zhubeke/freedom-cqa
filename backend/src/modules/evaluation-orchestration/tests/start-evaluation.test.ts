import assert from "node:assert/strict";
import test from "node:test";
import { startEvaluation } from "../application/start-evaluation.js";
import { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";

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

test("explicit reruns bypass completed reuse but retain active and request-key deduplication", async () => {
  const version = { _id: "v1", checklist_id: "checklist", criteria: [{ enabled: true }] };
  let reused = false, created = 0;
  const db = { collection: (name: string) => ({ findOne: async () => name === "conversations" ? { dataset_group_id: "DEV" } : version }) };
  const repository = {
    activeDuplicate: async () => null,
    reusable: async () => { reused = true; return { run_id: "old" }; },
    createRun: async (input: Record<string, unknown>) => { created++; return { run_id: "new", ...input }; }
  };
  const result = await startEvaluation(db as never, repository as never, "c1", "v1", { force: true });
  assert.equal(result.run.run_id, "new"); assert.equal(reused, false); assert.equal(created, 1);
  repository.activeDuplicate = async () => ({ run_id: "waiting-run" }) as never;
  const active = await startEvaluation(db as never, repository as never, "c1", "v1", { force: true });
  assert.equal(active.run.run_id, "waiting-run"); assert.equal(created, 1);
  const exact = { ...repository, runs: () => ({ findOne: async () => ({ run_id: "same-request" }) }) };
  const duplicate = await startEvaluation(db as never, exact as never, "c1", "v1", { force: true, requestKey: "request-1" });
  assert.equal(duplicate.run.run_id, "same-request"); assert.equal(created, 1);
});

test("evaluation history keeps duplicate conversation IDs separate when a dataset is supplied", async () => {
  const fixtures = [
    { run_id: "dev-report", conversation_id: "same-id", dataset_group_id: "DEV" },
    { run_id: "prod-report", conversation_id: "same-id", dataset_group_id: "PROD" }
  ];
  const repository = new EvaluationRepository({ collection: () => ({
    find: (filter: Record<string, string>) => {
      const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => fixtures.filter((item) => item.conversation_id === filter.conversation_id && (!filter.dataset_group_id || item.dataset_group_id === filter.dataset_group_id)) };
      return cursor;
    }
  }) } as never);
  repository.findFullRun = async (id: string) => fixtures.find((item) => item.run_id === id) as never;
  assert.deepEqual((await repository.history("same-id", "DEV")).map((item) => item!.run_id), ["dev-report"]);
  assert.deepEqual((await repository.history("same-id")).map((item) => item!.run_id), ["dev-report", "prod-report"]);
});

test("inactive checklists reject new evaluations while accepted pinned work can finish", async () => {
  const version = { _id: "v1", checklist_id: "custom", criteria: [{ enabled: true }] };
  const db = { collection: (name: string) => ({ findOne: async () => name === "conversations" ? { dataset_group_id: "DEV" }
    : name === "checklists" ? { _id: "custom", active_version_id: "v1", is_active: false } : version }) };
  let created = 0;
  const repository = { activeDuplicate: async () => null, createRun: async (input: Record<string, unknown>) => { created++; return { run_id: "new", ...input }; } };
  await assert.rejects(() => startEvaluation(db as never, repository as never, "p1-en-001", "v1"), /inactive/);
  assert.equal(created, 0);
  const accepted = await startEvaluation(db as never, repository as never, "p1-en-001", "v1", { allowInactiveChecklist: true });
  assert.equal(accepted.run.run_id, "new"); assert.equal(created, 1);
});
