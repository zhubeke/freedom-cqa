import type { ChecklistConfiguration } from "./checklist.types.js";
import { ChecklistError } from "./checklist.types.js";

const supportedTypes = new Set(["boolean", "numeric", "flag"]);

function required(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new ChecklistError(`${label} must not be empty`);
}

export function validateChecklistName(name: string): void {
  required(name, "Checklist name");
}

export function validateConfiguration(configuration: ChecklistConfiguration): number {
  if (configuration.sections.length === 0) throw new ChecklistError("At least one section is required");
  const sectionIds = new Set<string>();
  for (const section of configuration.sections) {
    required(section.id, "Section ID");
    required(section.name, "Section name");
    if (sectionIds.has(section.id)) throw new ChecklistError(`Duplicate section ID: ${section.id}`);
    sectionIds.add(section.id);
  }

  const criterionIds = new Set<string>();
  let total = 0;
  let positiveScoringCriteria = 0;
  for (const criterion of configuration.criteria) {
    required(criterion.id, "Criterion ID");
    required(criterion.code, "Criterion code");
    required(criterion.display_name, `Criterion ${criterion.code} name`);
    if (criterionIds.has(criterion.id)) throw new ChecklistError(`Duplicate criterion ID: ${criterion.id}`);
    criterionIds.add(criterion.id);
    if (!sectionIds.has(criterion.section_id)) throw new ChecklistError(`Criterion ${criterion.code} references unknown section ${criterion.section_id}`);
    if (!supportedTypes.has(criterion.answer_type)) throw new ChecklistError(`Unsupported answer type for criterion ${criterion.code}`);
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0) throw new ChecklistError(`Criterion ${criterion.code} has an invalid weight`);
    if (criterion.answer_type === "flag" && criterion.weight !== 0) throw new ChecklistError(`Flag criterion ${criterion.code} must have zero weight`);
    if (criterion.na_enabled && !criterion.na_rule.trim()) throw new ChecklistError(`Criterion ${criterion.code} requires an N/A applicability rule`);

    if (criterion.answer_type === "numeric") {
      const values = criterion.numeric_scale.map((option) => option.value);
      if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
        throw new ChecklistError(`Criterion ${criterion.code} has an invalid numeric scale`);
      }
      if (new Set(values).size !== values.length || values.some((value, index) => index > 0 && value <= (values[index - 1] ?? value))) {
        throw new ChecklistError(`Criterion ${criterion.code} numeric values must be unique and ascending`);
      }
      if (values[0] !== 0 || (values.at(-1) ?? 0) <= 0) throw new ChecklistError(`Criterion ${criterion.code} numeric scale must include zero and a positive maximum`);
      if (criterion.numeric_scale.some((option) => !option.description.trim())) throw new ChecklistError(`Criterion ${criterion.code} numeric scale descriptions must not be empty`);
    } else if (criterion.numeric_scale.length > 0) {
      throw new ChecklistError(`Criterion ${criterion.code} may only have a numeric scale when its answer type is numeric`);
    }

    if (criterion.enabled && criterion.answer_type !== "flag" && criterion.weight > 0) {
      total += criterion.weight;
      positiveScoringCriteria += 1;
    }
  }
  if (positiveScoringCriteria === 0) throw new ChecklistError("At least one enabled, positively weighted scoring criterion is required");
  if (Math.abs(total - 100) > 0.000001) throw new ChecklistError(`Total configured scoring weight must be 100; received ${total}`);
  return total;
}
