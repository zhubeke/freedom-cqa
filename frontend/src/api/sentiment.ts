import { apiGet, apiPost } from "./client";
import type { SentimentAnalysis } from "../shared/types/sentiment";

const query = (groupId: string) => `?datasetGroupId=${encodeURIComponent(groupId)}`;
export const sentimentKeys = { detail: (id: string, groupId: string) => ["conversation-sentiment", groupId, id] as const };
export function getSentiment(id: string, groupId: string, signal?: AbortSignal) { return apiGet<SentimentAnalysis>(`/v1/conversations/${encodeURIComponent(id)}/sentiment${query(groupId)}`, signal); }
export function analyzeSentiment(id: string, groupId: string) { return apiPost<{ status: string }>(`/v1/conversations/${encodeURIComponent(id)}/sentiment/analyze${query(groupId)}`, {}); }
