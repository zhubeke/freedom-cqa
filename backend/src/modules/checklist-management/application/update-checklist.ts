import type { ChecklistConfiguration, ChecklistRepository } from "../domain/checklist.types.js";
import { validateChecklistName, validateConfiguration } from "../domain/checklist.validation.js";

export async function updateChecklist(repository: ChecklistRepository, input: {
  checklistId: string;
  expectedActiveVersionId: string;
  name: string;
  description: string;
  configuration: ChecklistConfiguration;
}) {
  validateChecklistName(input.name);
  validateConfiguration(input.configuration);
  return repository.updateChecklist({
    ...input,
    name: input.name.trim(),
    description: input.description.trim()
  });
}
