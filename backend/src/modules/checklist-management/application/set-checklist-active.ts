import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";

/** Availability for new evaluations is independent of the selected immutable version. */
export async function setChecklistActive(repository: ChecklistRepository, id: string, isActive: boolean) {
  if (!isActive && id === "freedom-default-checklist") throw new ChecklistError("The original checklist is required for default evaluations", 409, "PROTECTED_CHECKLIST");
  const checklist = await repository.findChecklist(id);
  if (!checklist) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  if (isActive && (!checklist.active_version_id || !await repository.findVersion(id, checklist.active_version_id))) throw new ChecklistError("An active checklist requires a saved version", 409, "VERSION_NOT_FOUND");
  return repository.setActive(id, isActive);
}
