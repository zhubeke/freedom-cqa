import { ChecklistError, type ChecklistRepository } from "../domain/checklist.types.js";

export async function deleteChecklist(repository: ChecklistRepository, id: string): Promise<void> {
  if (!await repository.deleteChecklist(id)) {
    throw new ChecklistError("Checklist not found", 404, "CHECKLIST_NOT_FOUND");
  }
}
