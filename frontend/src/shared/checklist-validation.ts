import type { ChecklistCriterion, ChecklistSection } from "./types/checklist";

export interface ChecklistValidationIssue {
  id: string;
  message: string;
  category: "configuration" | "weight" | "scale";
  sectionId?: string;
  criterionId?: string;
  field: string;
}

/** Keep draft validation aligned with the server without coupling weight to raw score maxima. */
export function validateChecklistDraft(name: string, sections: ChecklistSection[], criteria: ChecklistCriterion[]): ChecklistValidationIssue[] {
  const issues: ChecklistValidationIssue[] = [];
  const add = (message: string, category: ChecklistValidationIssue["category"], field: string, criterion?: ChecklistCriterion, sectionId?: string) => issues.push({ id: `${criterion?.id ?? sectionId ?? "checklist"}:${field}:${issues.length}`, message, category, field, ...(criterion ? { criterionId: criterion.id, sectionId: criterion.section_id } : sectionId ? { sectionId } : {}) });
  if (!name.trim()) add("Checklist name is required", "configuration", "name");
  if (!sections.length) add("Add at least one section", "configuration", "sections");
  if (!criteria.length) add("Add at least one criterion", "configuration", "sections");
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (!section.id.trim() || sectionIds.has(section.id)) add("Section IDs must be present and unique", "configuration", "section-name", undefined, section.id);
    sectionIds.add(section.id);
    if (!section.name.trim()) add("Every section needs a name", "configuration", "section-name", undefined, section.id);
  }
  const scoring = criteria.filter((criterion) => criterion.enabled && criterion.answer_type !== "flag" && criterion.weight > 0);
  const total = scoring.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!Number.isFinite(total) || Math.abs(total - 100) > 0.000001) {
    const difference = Math.round(Math.abs(100 - total) * 1000000) / 1000000;
    add(`Total weight is ${total}/100 — ${difference} points ${total > 100 ? "over" : "missing"}`, "weight", "weight", scoring[0] ?? criteria[0]);
  }
  if (!scoring.length) add("Enable at least one positively weighted scoring criterion", "weight", "weight", criteria[0]);
  const criterionIds = new Set<string>();
  for (const criterion of criteria) {
    const label = `Criterion ${criterion.code || "(unnumbered)"}`;
    if (!criterion.id.trim() || criterionIds.has(criterion.id)) add(`${label} must have a unique identity`, "configuration", "display_name", criterion);
    criterionIds.add(criterion.id);
    if (!criterion.code.trim()) add("Criterion identifier is required", "configuration", "code", criterion);
    if (!criterion.display_name.trim()) add(`${label} needs a name`, "configuration", "display_name", criterion);
    if (!sectionIds.has(criterion.section_id)) add(`${label} belongs to a missing section`, "configuration", "display_name", criterion);
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0) add(`${label} has an invalid weight`, "weight", "weight", criterion);
    if (criterion.answer_type === "flag" && criterion.weight !== 0) add(`${label} is a non-scoring flag and must have zero weight`, "weight", "weight", criterion);
    if (criterion.na_enabled && !criterion.na_rule.trim()) add(`${label} requires an N/A applicability rule`, "configuration", "na_rule", criterion);
    if (criterion.answer_type === "numeric") {
      const values = criterion.numeric_scale.map((option) => option.value);
      if (new Set(values).size !== values.length) add(`${label} has duplicate score values`, "scale", "numeric_scale", criterion);
      if (values.length < 2 || values.some((value) => !Number.isFinite(value) || value < 0) || values[0] !== 0 || (values.at(-1) ?? 0) <= 0 || values.some((value, index) => index > 0 && value <= values[index - 1]!)) add(`${label} needs an ascending numerical scale starting at 0 with a positive maximum`, "scale", "numeric_scale", criterion);
      if (criterion.numeric_scale.some((option) => !option.description.trim())) add(`${label} requires a description for every score`, "scale", "numeric_scale", criterion);
    } else if (criterion.numeric_scale.length) add(`${label} may only have a numeric scale with a numeric answer type`, "scale", "answer_type", criterion);
  }
  return issues;
}

export function scoringWeight(criteria: ChecklistCriterion[]): number {
  return criteria.filter((criterion) => criterion.enabled && criterion.answer_type !== "flag" && criterion.weight > 0).reduce((sum, criterion) => sum + criterion.weight, 0);
}
