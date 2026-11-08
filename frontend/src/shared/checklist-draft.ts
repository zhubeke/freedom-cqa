import type { ChecklistCriterion, ChecklistSection, NumericScaleOption } from "./types/checklist";

export interface ChecklistSectionDraft { section: ChecklistSection; criteria: ChecklistCriterion[] }
export function groupChecklistDraft(sections: ChecklistSection[], criteria: ChecklistCriterion[]): ChecklistSectionDraft[] {
  return [...sections].sort((a, b) => a.display_order - b.display_order).map((section) => ({ section: { ...section }, criteria: criteria.filter((item) => item.section_id === section.id).sort((a, b) => a.display_order - b.display_order).map((criterion) => ({ ...criterion })) }));
}
/** IDs and all editable values survive both cross-section moves and reordering. */
export function flattenChecklistDraft(board: ChecklistSectionDraft[]): { sections: ChecklistSection[]; criteria: ChecklistCriterion[] } {
  let order = 0;
  return { sections: board.map((item, index) => ({ ...item.section, display_order: index + 1 })), criteria: board.flatMap((item) => item.criteria.map((criterion) => ({ ...criterion, section_id: item.section.id, display_order: ++order }))) };
}

export function nextCriterionCode(criteria: ChecklistCriterion[]): string {
  const codes = new Set(criteria.map((item) => item.code));
  let number = 1;
  while (codes.has(String(number).padStart(2, "0"))) number++;
  return String(number).padStart(2, "0");
}

/** Draft-only type history is keyed by identity, so a component remount cannot erase a scale. */
export function rememberNumericScales(criteria: ChecklistCriterion[], previous = new Map<string, NumericScaleOption[]>()): Map<string, NumericScaleOption[]> {
  const cache = new Map(previous);
  for (const criterion of criteria) if (criterion.answer_type === "numeric") cache.set(criterion.id, criterion.numeric_scale.map((option) => ({ ...option })));
  return cache;
}

/** A drag changes placement only. Reject a partial pair of source/target events rather than losing data. */
export function sameChecklistIdentities(before: { sections: ChecklistSection[]; criteria: ChecklistCriterion[] }, after: { sections: ChecklistSection[]; criteria: ChecklistCriterion[] }): boolean {
  const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();
  return JSON.stringify(ids(before.sections)) === JSON.stringify(ids(after.sections)) && JSON.stringify(ids(before.criteria)) === JSON.stringify(ids(after.criteria));
}
