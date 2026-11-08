import { apiPost } from "./client";
import type { ConversationIdentity } from "./conversations";

export interface ExportSelection { conversations?: ConversationIdentity[]; matching?: Record<string, string> }
export interface ExportPreview {
  eligible: ConversationIdentity[];
  issues: Array<ConversationIdentity & { error: string }>;
  model_conflict: boolean;
  models: Array<{ mode: string; name: string }>;
  configured: boolean;
}
export const previewExport = (selection: ExportSelection) => apiPost<ExportPreview>("/v1/results/export/preview", selection);
export async function downloadExport(selection: ExportSelection, filename = "cqa-conversations.json") {
  const result = await apiPost<unknown>("/v1/results/export", selection);
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
