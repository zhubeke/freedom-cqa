import type { ChecklistRepository } from "../domain/checklist.types.js";

export const activateChecklistVersion = (repository: ChecklistRepository, input: {
  checklistId: string;
  versionId: string;
  expectedActiveVersionId: string | null;
}) => repository.activateVersion(input);
