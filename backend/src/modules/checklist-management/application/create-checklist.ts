import type { ChecklistConfiguration, ChecklistRepository } from "../domain/checklist.types.js";
import { validateChecklistName, validateConfiguration } from "../domain/checklist.validation.js";

export async function createChecklist(repository: ChecklistRepository, input: { id?: string; name: string; description: string; configuration: ChecklistConfiguration }) {
  validateChecklistName(input.name);
  validateConfiguration(input.configuration);
  return repository.createChecklist({ ...input, name: input.name.trim(), description: input.description.trim() });
}
