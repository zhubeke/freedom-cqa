import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { activateChecklistVersion } from "../application/activate-checklist-version.js";
import { createChecklistVersion } from "../application/create-checklist-version.js";
import { ChecklistError, type ChecklistConfiguration, type ChecklistRecord, type ChecklistRepository, type ChecklistSummary, type ChecklistVersionRecord } from "../domain/checklist.types.js";
import { validateConfiguration } from "../domain/checklist.validation.js";
import { freedomDefaultConfiguration } from "../seed/freedom-default-checklist.js";
import { seedFreedomChecklist } from "../seed/seed-freedom-checklist.js";

class MemoryChecklistRepository implements ChecklistRepository {
  readonly checklists = new Map<string, ChecklistRecord>();
  readonly versions = new Map<string, ChecklistVersionRecord>();
  async ensureIndexes() {}
  async list(): Promise<ChecklistSummary[]> { return [...this.checklists.values()].map((item) => { const version = item.active_version_id ? this.versions.get(item.active_version_id) : undefined; return { ...structuredClone(item), active_version_number: version?.version_number ?? null, criterion_count: version?.criteria.length ?? 0, total_scoring_weight: version?.total_scoring_weight ?? 0 }; }); }
  async findChecklist(id: string) { return structuredClone(this.checklists.get(id) ?? null); }
  async findVersion(checklistId: string, versionId: string) { const item = this.versions.get(versionId); return item?.checklist_id === checklistId ? structuredClone(item) : null; }
  async listVersions(checklistId: string) { return [...this.versions.values()].filter((item) => item.checklist_id === checklistId).sort((a, b) => b.version_number - a.version_number).map((item) => structuredClone(item)); }
  async createChecklist(input: { id?: string; name: string; description: string; configuration: ChecklistConfiguration }) {
    if ([...this.checklists.values()].some((item) => item.name === input.name)) throw new ChecklistError("A checklist with this name already exists", 409, "CHECKLIST_ALREADY_EXISTS");
    const now = new Date(); const id = input.id ?? randomUUID(); const versionId = randomUUID();
    const checklist: ChecklistRecord = { id, name: input.name, description: input.description, active_version_id: versionId, created_at: now, updated_at: now };
    const version: ChecklistVersionRecord = { id: versionId, checklist_id: id, version_number: 1, created_at: now, created_from_version_id: null, ...structuredClone(input.configuration), total_scoring_weight: validateConfiguration(input.configuration), schema_version: 1 };
    this.checklists.set(id, checklist); this.versions.set(versionId, version); return structuredClone({ checklist, version });
  }
  async createVersion(input: { checklistId: string; createdFromVersionId: string; name: string; description: string; configuration: ChecklistConfiguration }) {
    const checklist = this.checklists.get(input.checklistId); if (!checklist) throw new ChecklistError("Checklist not found", 404); if (!this.versions.has(input.createdFromVersionId)) throw new ChecklistError("Created-from version is invalid");
    const number = Math.max(...[...this.versions.values()].filter((item) => item.checklist_id === input.checklistId).map((item) => item.version_number)) + 1; const now = new Date();
    const version: ChecklistVersionRecord = { id: randomUUID(), checklist_id: input.checklistId, version_number: number, created_at: now, created_from_version_id: input.createdFromVersionId, ...structuredClone(input.configuration), total_scoring_weight: validateConfiguration(input.configuration), schema_version: 1 };
    this.versions.set(version.id, version); this.checklists.set(checklist.id, { ...checklist, name: input.name, description: input.description, updated_at: now }); return structuredClone(version);
  }
  async activateVersion(input: { checklistId: string; versionId: string; expectedActiveVersionId: string | null }) {
    const checklist = this.checklists.get(input.checklistId); if (!checklist) throw new ChecklistError("Checklist not found", 404); const version = this.versions.get(input.versionId); if (!version || version.checklist_id !== input.checklistId) throw new ChecklistError("Invalid version"); if (checklist.active_version_id !== input.expectedActiveVersionId) throw new ChecklistError("Concurrent change", 409, "CONCURRENT_CHANGE"); const updated = { ...checklist, active_version_id: input.versionId, updated_at: new Date() }; this.checklists.set(checklist.id, updated); return structuredClone(updated);
  }
}

const seed = async () => { const repository = new MemoryChecklistRepository(); await seedFreedomChecklist(repository); const checklist = (await repository.list())[0]!; const version = (await repository.listVersions(checklist.id))[0]!; return { repository, checklist, version }; };

test("initial Freedom checklist seed has the exact source configuration", async () => {
  const { checklist, version } = await seed();
  assert.equal(checklist.id, "freedom-default-checklist");
  assert.equal(checklist.criterion_count, 8); assert.equal(checklist.total_scoring_weight, 100);
  assert.equal(version.version_number, 1); assert.equal(version.criteria.length, 8); assert.equal(version.total_scoring_weight, 100);
  assert.deepEqual(version.criteria.map((item) => item.weight), [10, 15, 20, 20, 15, 15, 5, 0]);
  assert.deepEqual(version.criteria.filter((item) => item.na_enabled).map((item) => item.code), ["02", "03", "04", "07"]);
  assert.deepEqual(version.criteria.find((item) => item.code === "04")?.numeric_scale.map((item) => item.value), [0, 5, 10, 15, 20]);
  assert.deepEqual(version.criteria.find((item) => item.code === "06")?.numeric_scale.map((item) => item.value), [0, 4, 7, 10]);
  const severe = version.criteria.find((item) => item.code === "08")!; assert.equal(severe.answer_type, "flag"); assert.equal(severe.weight, 0);
  assert.match(version.criteria[0]!.source_name, /Установление/);
});

test("duplicate seeding is idempotent", async () => { const { repository } = await seed(); await seedFreedomChecklist(repository); assert.equal(repository.checklists.size, 1); assert.equal(repository.versions.size, 1); });

test("editing, adding, and changing weights creates version 2 without changing version 1", async () => {
  const { repository, checklist, version: original } = await seed(); const configuration = structuredClone({ sections: original.sections, criteria: original.criteria });
  configuration.criteria[0]!.display_name = "A clearer contact title"; configuration.criteria[0]!.answer_type = "numeric"; configuration.criteria[0]!.numeric_scale = [{ value: 0, description: "Missing" }, { value: 10, description: "Complete" }]; configuration.criteria[0]!.weight = 5; configuration.criteria[1]!.weight = 20;
  configuration.criteria.push({ id: randomUUID(), code: "09", display_order: 9, section_id: configuration.sections[0]!.id, source_name: "", display_name: "New configurable criterion", description: "Added by a user", evaluation_instructions: "Check it", answer_type: "flag", weight: 0, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true });
  const second = await createChecklistVersion(repository, { checklistId: checklist.id, createdFromVersionId: original.id, name: checklist.name, description: checklist.description, configuration });
  assert.equal(second.version_number, 2); assert.equal(second.criteria.length, 9); assert.equal(second.criteria[0]!.display_name, "A clearer contact title"); assert.equal(second.total_scoring_weight, 100);
  const unchanged = await repository.findVersion(checklist.id, original.id); assert.equal(unchanged?.criteria.length, 8); assert.equal(unchanged?.criteria[0]?.display_name, "Establishing Contact"); assert.equal(unchanged?.criteria[0]?.answer_type, "boolean");
  const activated = await activateChecklistVersion(repository, { checklistId: checklist.id, versionId: second.id, expectedActiveVersionId: original.id }); assert.equal(activated.active_version_id, second.id);
  const restored = await activateChecklistVersion(repository, { checklistId: checklist.id, versionId: original.id, expectedActiveVersionId: second.id }); assert.equal(restored.active_version_id, original.id);
});

test("invalid configurations are rejected with meaningful errors", () => {
  const cases: Array<[string, (configuration: ChecklistConfiguration) => void, RegExp]> = [
    ["total weight", (value) => { value.criteria[0]!.weight = 9; }, /must be 100/],
    ["duplicate criterion", (value) => { value.criteria[1]!.id = value.criteria[0]!.id; }, /Duplicate criterion ID/],
    ["invalid section", (value) => { value.criteria[0]!.section_id = "missing"; }, /unknown section/],
    ["missing N\/A rule", (value) => { value.criteria[1]!.na_rule = ""; }, /requires an N\/A/],
    ["flag weight", (value) => { value.criteria[7]!.weight = 1; }, /zero weight/],
    ["numeric order", (value) => { value.criteria[3]!.numeric_scale = [{ value: 0, description: "Zero" }, { value: 5, description: "Five" }, { value: 4, description: "Four" }]; }, /unique and ascending/],
    ["numeric zero", (value) => { value.criteria[3]!.numeric_scale[0]!.value = 1; }, /include zero/],
    ["no positive criterion", (value) => { value.criteria.forEach((item) => { item.enabled = item.answer_type === "flag"; }); }, /positively weighted/]
  ];
  for (const [label, mutate, expected] of cases) { const configuration = structuredClone(freedomDefaultConfiguration); mutate(configuration); assert.throws(() => validateConfiguration(configuration), expected, label); }
});

test("activation detects concurrent active-version changes", async () => { const { repository, checklist, version } = await seed(); await assert.rejects(() => activateChecklistVersion(repository, { checklistId: checklist.id, versionId: version.id, expectedActiveVersionId: "stale" }), (error: unknown) => error instanceof ChecklistError && error.code === "CONCURRENT_CHANGE"); });
