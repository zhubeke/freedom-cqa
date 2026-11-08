import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";

export async function getChecklist(repository: ChecklistRepository, id: string) {
  const checklist = await repository.findChecklist(id);
  if (!checklist) throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  const active_version = checklist.active_version_id
    ? await repository.findVersion(id, checklist.active_version_id)
    : null;
  return { ...checklist, active_version };
}

export async function getChecklistVersion(repository: ChecklistRepository, checklistId: string, versionId: string) {
  const version = await repository.findVersion(checklistId, versionId);
  if (!version) throw new ChecklistError("Checklist version not found", 404, "VERSION_NOT_FOUND");
  return version;
}
