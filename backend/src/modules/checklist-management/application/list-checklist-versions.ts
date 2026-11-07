import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";

export async function listChecklistVersions(repository: ChecklistRepository, checklistId: string) {
  if (!await repository.findChecklist(checklistId)) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  return repository.listVersions(checklistId);
}
