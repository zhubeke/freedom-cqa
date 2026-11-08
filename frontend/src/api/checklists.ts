import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { Checklist, ChecklistCriterion, ChecklistDetail, ChecklistSection, ChecklistSummary, ChecklistVersion } from "../shared/types/checklist";

export const checklistKeys = { all: ["checklists"] as const, detail: (id: string) => ["checklists", id] as const, versions: (id: string) => ["checklists", id, "versions"] as const, version: (id: string, versionId: string) => ["checklists", id, "versions", versionId] as const };
export const listChecklists = (signal?: AbortSignal) => apiGet<ChecklistSummary[]>("/v1/checklists", signal);
export const getChecklist = (id: string, signal?: AbortSignal) => apiGet<ChecklistDetail>(`/v1/checklists/${id}`, signal);
export const createChecklist = (body: { name: string; description: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }) => apiPost<{ checklist: Checklist; version: ChecklistVersion }>("/v1/checklists", body);
export const updateChecklist = (id: string, body: { name: string; description: string; expected_active_version_id: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }) => apiPut<{ checklist: Checklist; version: ChecklistVersion }>(`/v1/checklists/${encodeURIComponent(id)}`, body);
export const deleteChecklist = (id: string) => apiDelete(`/v1/checklists/${encodeURIComponent(id)}`);
export const setChecklistStatus = (id: string, isActive: boolean) => apiPost<Checklist>(`/v1/checklists/${encodeURIComponent(id)}/status`, { is_active: isActive });
export const duplicateChecklist = (id: string) => apiPost<{ checklist: Checklist; version: ChecklistVersion }>(`/v1/checklists/${encodeURIComponent(id)}/duplicate`, {});
