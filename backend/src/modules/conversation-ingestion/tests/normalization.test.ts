import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConversation } from "../application/normalize-conversation.js";

test("preserves message order and creates index-based stable IDs", () => {
  const result = normalizeConversation("DEV", {
    conversation_id: "p1-ru-001", channel: "agent chat", language: "RU", audio_url: null,
    transcript: [
      { timestamp: "00:09", speaker: "client", text: "same" },
      { timestamp: "00:09", speaker: "operator", text: "same" }
    ]
  });
  assert.deepEqual(result.transcript.map((item) => item.message_id), ["p1-ru-001:m0000", "p1-ru-001:m0001"]);
  assert.deepEqual(result.transcript.map((item) => item.text), ["same", "same"]);
  assert.equal(result.normalized_channel, "chat");
  assert.equal(result.normalized_language, "ru");
});
