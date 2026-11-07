import { apiGet, apiPost } from "./client";
import type { Checklist, ChecklistCriterion, ChecklistDetail, ChecklistSection, ChecklistSummary, ChecklistVersion } from "../shared/types/checklist";

export const checklistKeys = { all: ["checklists"] as const, detail: (id: string) => ["checklists", id] as const, versions: (id: string) => ["checklists", id, "versions"] as const, version: (id: string, versionId: string) => ["checklists", id, "versions", versionId] as const };
export const listChecklists = (signal?: AbortSignal) => apiGet<ChecklistSummary[]>("/v1/checklists", signal);
export const getChecklist = (id: string, signal?: AbortSignal) => apiGet<ChecklistDetail>(`/v1/checklists/${id}`, signal);
export const listChecklistVersions = (id: string, signal?: AbortSignal) => apiGet<ChecklistVersion[]>(`/v1/checklists/${id}/versions`, signal);
export const getChecklistVersion = (id: string, versionId: string, signal?: AbortSignal) => apiGet<ChecklistVersion>(`/v1/checklists/${id}/versions/${versionId}`, signal);
export const createChecklist = (body: { name: string; description: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }) => apiPost<{ checklist: Checklist; version: ChecklistVersion }>("/v1/checklists", body);
export const saveChecklistVersion = (id: string, body: { name: string; description: string; created_from_version_id: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }) => apiPost<ChecklistVersion>(`/v1/checklists/${id}/versions`, body);
export const activateChecklistVersion = (id: string, body: { version_id: string; expected_active_version_id: string | null }) => apiPost<Checklist>(`/v1/checklists/${id}/activate`, body);
