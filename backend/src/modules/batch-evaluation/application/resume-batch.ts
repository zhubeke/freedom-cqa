import type { BatchRepository } from "../adapters/persistence/batch-repository.js";
import { BatchRequestError } from "./create-batch.js";

export async function resumeBatch(repository: BatchRepository, batchId: string) {
  const batch = await repository.find(batchId);
  if (!batch) throw new BatchRequestError("Batch not found", 404);
  if (["completed", "completed_with_errors"].includes(batch.status)) throw new BatchRequestError("Completed batches cannot be resumed", 409);
  await repository.collection().updateOne({ batch_id: batchId }, {
    $set: {
      status: "queued", last_error: null, finished_at: null, publication_status: "pending",
      active_key: `${batch.dataset_group_id}:${batch.checklist_version_id}:${batch.model_id}:${batch.prompt_version}:${batch.max_conversations ?? "full"}`
    }
  });
  return (await repository.find(batchId))!;
}
