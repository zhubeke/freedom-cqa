import { apiGet, apiPost } from "./client";
import type { AudioAnalysis } from "../shared/types/audio";

const query = (groupId: string) => `?datasetGroupId=${encodeURIComponent(groupId)}`;
export const audioKeys = { detail: (id: string, groupId: string) => ["audio-analysis", groupId, id] as const };
export function getAudioAnalysis(id: string, groupId: string, signal?: AbortSignal) {
  return apiGet<AudioAnalysis>(`/v1/conversations/${encodeURIComponent(id)}/audio-analysis${query(groupId)}`, signal);
}
export function startAudioAnalysis(id: string, groupId: string, force = false) {
  return apiPost<AudioAnalysis>(`/v1/conversations/${encodeURIComponent(id)}/audio/analyze`, { datasetGroupId: groupId, force });
}
export function audioPlaybackUrl(id:string,groupId:string){
  const base=(import.meta.env.VITE_API_BASE_URL??"/api").replace(/\/$/,"");
  return `${base}/v1/conversations/${encodeURIComponent(id)}/audio${query(groupId)}`;
}
