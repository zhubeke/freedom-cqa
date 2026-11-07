import type { ChecklistRepository } from "../domain/checklist.types.js";
import { ChecklistError } from "../domain/checklist.types.js";
import { createChecklist } from "../application/create-checklist.js";
import { FREEDOM_DEFAULT_CHECKLIST_DESCRIPTION, FREEDOM_DEFAULT_CHECKLIST_NAME, freedomDefaultConfiguration } from "./freedom-default-checklist.js";

export async function seedFreedomChecklist(repository: ChecklistRepository): Promise<void> {
  await repository.ensureIndexes();
  const existing = await repository.findChecklist("freedom-default-checklist") ?? (await repository.list()).find((item) => item.name === FREEDOM_DEFAULT_CHECKLIST_NAME);
  if (existing) return;
  try {
    await createChecklist(repository, {
      id: "freedom-default-checklist",
      name: FREEDOM_DEFAULT_CHECKLIST_NAME,
      description: FREEDOM_DEFAULT_CHECKLIST_DESCRIPTION,
      configuration: freedomDefaultConfiguration
    });
  } catch (error) {
    if (!(error instanceof ChecklistError) || error.code !== "CHECKLIST_ALREADY_EXISTS") throw error;
  }
}
