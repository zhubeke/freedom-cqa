import type { ImportRepository } from "../../dataset-import/application/import-repository.js";

export async function getImportStatus(repository: ImportRepository, importId: string) {
  const item = await repository.find(importId);
  if (!item) return null;
  return {
    import_id: item.import_id,
    dataset_group_id: item.dataset_group_id,
    status: item.status,
    total_records: item.total_records,
    processed_count: item.processed_count,
    requested_at: item.requested_at,
    processed_at: item.processed_at,
    error: item.last_error
  };
}
