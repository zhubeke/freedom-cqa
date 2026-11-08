import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";

export async function deleteChecklist(repository: ChecklistRepository, id: string): Promise<void> {
  const checklist = await repository.findChecklist(id);
  if (id === "freedom-default-checklist") throw new ChecklistError("The original checklist cannot be deleted", 409, "PROTECTED_CHECKLIST");
  if (checklist && checklist.is_active !== false) throw new ChecklistError("Deactivate the checklist before deleting it", 409, "ACTIVE_CHECKLIST");
  if (!await repository.deleteChecklist(id)) {
    throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  }
}
