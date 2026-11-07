import { DateTime } from "luxon";
import { mean, median, max, min } from "simple-statistics";
import type { DeterministicMetadata } from "../schemas/metadata.schemas.js";
import type { NormalizedConversation, NormalizedMessage, NullableMetric } from "./metadata.types.js";

const HANDOFF_PATTERNS = [/эскалац/i, /переведен.*(оператор|представител)/i, /transferred to an agent/i, /agent.*join/i, /оператор.*подключ/i];
const LONG_WAIT_SECONDS = 60;

function seconds(message: NormalizedMessage, channel: string): number | null {
  if (channel === "chat") {
    const match = /^(\d+):([0-5]\d)$/.exec(message.timestamp);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  const parsed = DateTime.fromISO(message.timestamp, { setZone: true });
  return parsed.isValid ? parsed.toMillis() / 1000 : null;
}

function metric(values: number[], operation: (items: number[]) => number, reason: string): NullableMetric {
  return values.length ? { value: operation(values), reason: null } : { value: null, reason };
}

export function extractDeterministicMetadata(conversation: NormalizedConversation): DeterministicMetadata {
  const timed = conversation.transcript.map((message) => ({ message, at: seconds(message, conversation.normalized_channel) }));
  const validTimes = timed.map(({ at }) => at).filter((value): value is number => value !== null);
  const nondecreasing = validTimes.every((value, index) => index === 0 || value >= validTimes[index - 1]!);
  const timestampQuality = conversation.transcript.length < 2 ? "insufficient"
    : validTimes.length === 0 ? "invalid"
    : validTimes.length !== conversation.transcript.length || !nondecreasing ? "partial" : "valid";
  const duration = validTimes.length > 1
    ? { value: Math.max(...validTimes) - Math.min(...validTimes), reason: null }
    : { value: null, reason: "At least two valid timestamps are required" };

  const counts = { client: 0, operator: 0, bot: 0, system: 0 };
  for (const item of conversation.transcript) counts[item.speaker] += 1;
  const turns: Array<{ speaker: NormalizedMessage["speaker"]; messages: NormalizedMessage[] }> = [];
  for (const message of conversation.transcript) {
    const current = turns.at(-1);
    if (current?.speaker === message.speaker) current.messages.push(message);
    else turns.push({ speaker: message.speaker, messages: [message] });
  }
  const clientTurnCount = turns.filter((turn) => turn.speaker === "client").length;
  const operatorTurnCount = turns.filter((turn) => turn.speaker === "operator").length;

  const handoffs = timed.filter(({ message }) => message.speaker === "system" && HANDOFF_PATTERNS.some((pattern) => pattern.test(message.text)));
  const humanMessages = timed.filter(({ message }) => message.speaker === "client" || message.speaker === "operator");
  const responsePairs: Array<{ client: NormalizedMessage; operator: NormalizedMessage; latency: number }> = [];
  let pendingClient: { message: NormalizedMessage; at: number } | null = null;
  for (const item of humanMessages) {
    if (item.at === null) continue;
    if (item.message.speaker === "client") pendingClient = { message: item.message, at: item.at };
    else if (pendingClient) {
      const latency = item.at - pendingClient.at;
      if (latency >= 0) responsePairs.push({ client: pendingClient.message, operator: item.message, latency });
      pendingClient = null;
    }
  }
  const latencies = responsePairs.map((pair) => pair.latency);
  const firstHandoff = handoffs.find(({ at }) => at !== null);
  const firstOperatorAfterHandoff = firstHandoff?.at === null || firstHandoff?.at === undefined ? null
    : timed.find(({ message, at }) => message.speaker === "operator" && at !== null && at >= firstHandoff.at!);
  const afterHandoff = firstHandoff?.at !== null && firstHandoff?.at !== undefined && firstOperatorAfterHandoff?.at !== null && firstOperatorAfterHandoff?.at !== undefined
    ? { value: firstOperatorAfterHandoff.at - firstHandoff.at, reason: null }
    : { value: null, reason: handoffs.length ? "No valid operator response after handoff" : "No human handoff was detected" };

  return {
    conversation: {
      language: conversation.normalized_language,
      channel: conversation.normalized_channel,
      duration_seconds: duration,
      total_message_count: conversation.transcript.length,
      first_timestamp: conversation.transcript[0]?.timestamp ?? null,
      last_timestamp: conversation.transcript.at(-1)?.timestamp ?? null,
      timestamp_quality: timestampQuality
    },
    messages_and_turns: {
      client_message_count: counts.client, operator_message_count: counts.operator,
      bot_message_count: counts.bot, system_message_count: counts.system,
      client_turn_count: clientTurnCount, operator_turn_count: operatorTurnCount,
      human_handoff_count: handoffs.length,
      operator_to_client_turn_ratio: clientTurnCount ? { value: operatorTurnCount / clientTurnCount, reason: null } : { value: null, reason: "No client turns" }
    },
    response_timing: {
      first_operator_response_seconds: metric(latencies.slice(0, 1), (items) => items[0]!, "No client-to-operator response pair"),
      first_operator_response_after_handoff_seconds: afterHandoff,
      average_operator_response_seconds: metric(latencies, mean, "No client-to-operator response pairs"),
      median_operator_response_seconds: metric(latencies, median, "No client-to-operator response pairs"),
      maximum_operator_response_seconds: metric(latencies, max, "No client-to-operator response pairs"),
      minimum_operator_response_seconds: metric(latencies, min, "No client-to-operator response pairs"),
      operator_responses_measured: latencies.length,
      long_waiting_periods: responsePairs.filter((pair) => pair.latency >= LONG_WAIT_SECONDS).map((pair) => ({
        client_message_id: pair.client.message_id, operator_message_id: pair.operator.message_id, duration_seconds: pair.latency
      }))
    }
  };
}
