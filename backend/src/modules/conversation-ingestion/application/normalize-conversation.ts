import type { SourceRecord } from "../schemas/dataset.js";

function elapsedMs(timestamp: string, firstTimestamp: string, channel: string): number | null {
  if (channel === "agent chat") {
    const parts = timestamp.split(":").map(Number);
    return ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
  }
  const current = Date.parse(timestamp);
  const first = Date.parse(firstTimestamp);
  return Number.isNaN(current) || Number.isNaN(first) ? null : current - first;
}

export function normalizeConversation(datasetGroupId: string, record: SourceRecord, now = new Date()) {
  const roleMessageCounts = { client: 0, operator: 0, bot: 0, system: 0 };
  const firstTimestamp = record.transcript[0]?.timestamp ?? "";
  const transcript = record.transcript.map((message, index) => {
    roleMessageCounts[message.speaker] += 1;
    return {
      message_id: `${record.conversation_id}:m${String(index).padStart(4, "0")}`,
      timestamp: message.timestamp,
      elapsed_ms: elapsedMs(message.timestamp, firstTimestamp, record.channel),
      speaker: message.speaker,
      text: message.text
    };
  });
  const elapsed = transcript.map((message) => message.elapsed_ms).filter((value): value is number => value !== null);
  return {
    dataset_group_id: datasetGroupId,
    conversation_id: record.conversation_id,
    original_channel: record.channel,
    original_language: record.language,
    normalized_channel: record.channel === "voice call" ? "call" : "chat",
    normalized_language: record.language.toLowerCase() === "kz" ? "kk" : record.language.toLowerCase(),
    transcript,
    message_count: transcript.length,
    role_message_counts: roleMessageCounts,
    has_audio: Boolean(record.audio_url),
    audio_url: record.audio_url,
    duration_ms: elapsed.length > 1 ? Math.max(...elapsed) - Math.min(...elapsed) : null,
    created_at: now,
    updated_at: now
  };
}
