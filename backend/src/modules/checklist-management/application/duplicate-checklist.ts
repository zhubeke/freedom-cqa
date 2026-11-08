import { randomUUID } from "node:crypto";
import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";
import { createChecklist } from "./create-checklist.js";

export async function duplicateChecklist(repository: ChecklistRepository, id: string, requestedName?: string) {
  const source = await repository.findChecklist(id);
  if (!source) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  const version = source.active_version_id ? await repository.findVersion(id, source.active_version_id) : null;
  if (!version) throw new ChecklistError("A saved version is required to duplicate this checklist", 409, "VERSION_NOT_FOUND");
  const names = new Set((await repository.list()).map(item => item.name));
  let name = requestedName?.trim() || `${source.name} (copy)`;
  if (!requestedName?.trim()) { let suffix = 2; while (names.has(name)) name = `${source.name} (copy ${suffix++})`; }
  const sectionIds = new Map(version.sections.map(section => [section.id, randomUUID()]));
  const result = await createChecklist(repository, { name, description: source.description, configuration: {
    sections: version.sections.map(section => ({ ...section, id: sectionIds.get(section.id)! })),
    criteria: version.criteria.map(criterion => ({ ...structuredClone(criterion), id: randomUUID(), section_id: sectionIds.get(criterion.section_id)! }))
  } });
  return { ...result, checklist: await repository.setActive(result.checklist.id, false) };
}
