import { apiGet, apiPost } from "./client";
import type { AudioMetrics, ConversationMetadata } from "../shared/types/metadata";

export const metadataKeys = {
  detail: (id: string, groupId: string) => ["conversation-metadata", groupId, id] as const,
  audio: (id: string, groupId: string) => ["audio-metrics", groupId, id] as const
};

function query(groupId: string): string { return `?datasetGroupId=${encodeURIComponent(groupId)}`; }
export function getMetadata(id: string, groupId: string, signal?: AbortSignal) { return apiGet<ConversationMetadata>(`/v1/conversations/${encodeURIComponent(id)}/metadata${query(groupId)}`, signal); }
export function getAudioMetrics(id: string, groupId: string, signal?: AbortSignal) { return apiGet<AudioMetrics>(`/v1/conversations/${encodeURIComponent(id)}/audio-metrics${query(groupId)}`, signal); }
export function extractMetadata(id: string, groupId: string) { return apiPost<{ status: string }>(`/v1/conversations/${encodeURIComponent(id)}/metadata/extract${query(groupId)}`, {}); }

