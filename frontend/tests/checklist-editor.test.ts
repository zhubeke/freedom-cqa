import assert from "node:assert/strict";
import test from "node:test";
import { flattenChecklistDraft, groupChecklistDraft, nextCriterionCode, rememberNumericScales, sameChecklistIdentities } from "../src/shared/checklist-draft.ts";
import { scoringWeight, validateChecklistDraft } from "../src/shared/checklist-validation.ts";
import { freedomDefaultConfiguration } from "../../backend/src/modules/checklist-management/seed/freedom-default-checklist.ts";

const draft = () => structuredClone(freedomDefaultConfiguration);

test("the original Freedom scoring rules pass frontend validation without changing raw scales", () => {
  const { sections, criteria } = draft();
  assert.equal(criteria.length, 8);
  assert.equal(criteria.filter((criterion) => criterion.enabled && criterion.weight > 0).length, 7);
  assert.equal(scoringWeight(criteria), 100);
  assert.equal(criteria.filter((criterion) => criterion.na_enabled).length, 4);
  assert.deepEqual(criteria.find((criterion) => criterion.code === "04")!.numeric_scale.map((option) => option.value), [0, 5, 10, 15, 20]);
  const dialogue = criteria.find((criterion) => criterion.code === "06")!;
  assert.equal(dialogue.weight, 15);
  assert.deepEqual(dialogue.numeric_scale.map((option) => option.value), [0, 4, 7, 10]);
  assert.equal(criteria.find((criterion) => criterion.code === "08")!.weight, 0);
  assert.deepEqual(validateChecklistDraft("Freedom", sections, criteria), []);
});

test("section and cross-section reordering preserve identities, scales, and unsaved values", () => {
  const original = draft(); const originalSnapshot = JSON.stringify(original);
  const board = groupChecklistDraft(original.sections, original.criteria);
  const moved = board[1]!.criteria.splice(1, 1)[0]!;
  moved.description = "Unsaved edited description";
  board[0]!.criteria.unshift(moved);
  board.reverse();
  const flattened = flattenChecklistDraft(board);
  assert.equal(flattened.criteria.length, original.criteria.length);
  assert.deepEqual(new Set(flattened.criteria.map((criterion) => criterion.id)), new Set(original.criteria.map((criterion) => criterion.id)));
  const result = flattened.criteria.find((criterion) => criterion.id === moved.id)!;
  assert.equal(result.section_id, "beginning");
  assert.equal(result.description, "Unsaved edited description");
  assert.deepEqual(result.numeric_scale, moved.numeric_scale);
  assert.deepEqual(flattened.sections.map((section) => section.display_order), [1, 2, 3, 4]);
  assert.deepEqual(flattened.criteria.map((criterion) => criterion.display_order), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(JSON.stringify(original), originalSnapshot, "historical configuration must not be mutated");
});

test("weight validation excludes disabled criteria but includes N/A-enabled criteria", () => {
  const { sections, criteria } = draft();
  criteria[1]!.na_enabled = false;
  assert.equal(scoringWeight(criteria), 100);
  criteria[1]!.enabled = false;
  assert.equal(scoringWeight(criteria), 85);
  const issue = validateChecklistDraft("Freedom", sections, criteria).find((item) => item.category === "weight")!;
  assert.match(issue.message, /85\/100.*15 points missing/);
  assert.ok(issue.criterionId, "weight validation should have a navigable criterion");
});

test("scale validation is independent of weights and rejects duplicate, unordered, missing, and nonfinite values", () => {
  for (const values of [[0, 4, 4, 10], [0, 7, 4, 10], [0, 0], [0, Number.NaN], [-1, 10], [0]]) {
    const { sections, criteria } = draft();
    criteria.find((criterion) => criterion.code === "06")!.numeric_scale = values.map((value) => ({ value, description: "Description" }));
    const issues = validateChecklistDraft("Freedom", sections, criteria);
    assert.ok(issues.some((issue) => issue.category === "scale" && issue.criterionId === "freedom-criterion-06"));
    assert.ok(!issues.some((issue) => issue.category === "weight"));
  }
});

test("required scale descriptions and N/A rules link to their correct draft fields", () => {
  const { sections, criteria } = draft();
  criteria[1]!.na_rule = " ";
  criteria.find((criterion) => criterion.code === "06")!.numeric_scale[0]!.description = " ";
  const issues = validateChecklistDraft("Freedom", sections, criteria);
  assert.ok(issues.some((issue) => issue.criterionId === "freedom-criterion-02" && issue.sectionId === "beginning" && issue.field === "na_rule"));
  assert.ok(issues.some((issue) => issue.criterionId === "freedom-criterion-06" && issue.field === "numeric_scale"));
  criteria[1]!.na_enabled = false;
  assert.ok(!validateChecklistDraft("Freedom", sections, criteria).some((issue) => issue.field === "na_rule"));
  assert.equal(criteria[1]!.na_rule, " ", "turning N/A off must not rewrite its draft rule");
});

test("boolean configurations cannot retain a numeric scale and new codes avoid existing codes", () => {
  const { sections, criteria } = draft();
  criteria[0]!.numeric_scale = [{ value: 0, description: "No" }, { value: 1, description: "Yes" }];
  assert.ok(validateChecklistDraft("Freedom", sections, criteria).some((issue) => issue.criterionId === criteria[0]!.id && issue.field === "answer_type"));
  criteria[0]!.code = "09";
  assert.equal(nextCriterionCode(criteria), "01");
  criteria[0]!.code = "01";
  assert.equal(nextCriterionCode(criteria), "09");
});

test("numeric type history survives a cross-section remount without flattening nonuniform values", () => {
  const { sections, criteria } = draft();
  const dialogue = criteria.find((criterion) => criterion.code === "06")!;
  dialogue.numeric_scale[1]!.description = "Unsaved custom description";
  let cache = rememberNumericScales(criteria);
  const expected = structuredClone(dialogue.numeric_scale);
  dialogue.answer_type = "boolean";
  dialogue.numeric_scale = [];
  const board = groupChecklistDraft(sections, criteria);
  const source = board.find((entry) => entry.section.id === dialogue.section_id)!;
  const moved = source.criteria.splice(source.criteria.findIndex((criterion) => criterion.id === dialogue.id), 1)[0]!;
  board[0]!.criteria.push(moved);
  const after = flattenChecklistDraft(board);
  cache = rememberNumericScales(after.criteria, cache);
  assert.deepEqual(cache.get(dialogue.id), expected);
  assert.deepEqual(cache.get(dialogue.id)!.map((option) => option.value), [0, 4, 7, 10]);
  assert.equal(cache.get(dialogue.id)![1]!.description, "Unsaved custom description");
});

test("a drag transaction rejects incomplete add/remove events and duplicated identities", () => {
  const original = draft();
  const board = groupChecklistDraft(original.sections, original.criteria);
  const moved = board[1]!.criteria.splice(0, 1)[0]!;
  assert.equal(sameChecklistIdentities(original, flattenChecklistDraft(board)), false, "an unfinished removal must never be published");
  board[0]!.criteria.push(moved);
  assert.equal(sameChecklistIdentities(original, flattenChecklistDraft(board)), true, "settled cross-section moves retain every identity");
  board[1]!.criteria.push(moved);
  assert.equal(sameChecklistIdentities(original, flattenChecklistDraft(board)), false, "a duplicate target add must never be published");
});
