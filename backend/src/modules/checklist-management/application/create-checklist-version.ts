import type { ChecklistConfiguration, ChecklistRepository } from "../domain/checklist.types.js";
import { validateChecklistName, validateConfiguration } from "../domain/checklist.validation.js";

export async function createChecklistVersion(repository: ChecklistRepository, input: {
  checklistId: string;
  createdFromVersionId: string;
  name: string;
  description: string;
  configuration: ChecklistConfiguration;
}) {
  validateChecklistName(input.name);
  validateConfiguration(input.configuration);
  return repository.createVersion({ ...input, name: input.name.trim(), description: input.description.trim() });
}
