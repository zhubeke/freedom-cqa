import type { ChecklistRepository } from "../domain/checklist.types.js";

export const listChecklists = (repository: ChecklistRepository) => repository.list();
