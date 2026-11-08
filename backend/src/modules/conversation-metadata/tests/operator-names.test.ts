import assert from "node:assert/strict";
import test from "node:test";
import { extractOperatorNames } from "../application/extract-operator-names.js";

test("extracts unique Russian, Kazakh, and English operator introductions", () => {
  const names = extractOperatorNames([
    { message_id: "ru", speaker: "operator", text: "Здравствуйте, меня зовут Алина." },
    { message_id: "kk", speaker: "operator", text: "Сәлеметсіз бе, менің атым Аружан." },
    { message_id: "en", speaker: "operator", text: "Hi, I'm Maya from support." },
    { message_id: "client", speaker: "client", text: "Меня зовут Клиент." },
    { message_id: "mention", speaker: "operator", text: "Ваше имя Сергей, верно?" }
  ]);
  assert.deepEqual(names.map((item) => item.name), ["Алина", "Аружан", "Maya"]);
  assert.deepEqual(names.map((item) => item.evidence_message_id), ["ru", "kk", "en"]);
});

test("prefers structured identities and rejects hidden placeholders", () => {
  const names = extractOperatorNames([
    { message_id: "hidden", speaker: "operator", text: "Меня зовут [Имя скрыто]." },
    { message_id: "bot", speaker: "bot", text: "I'm Botname." }
  ], ["Dana", "[Name hidden]"]);
  assert.deepEqual(names, [{ name: "Dana", evidence_message_id: null, source: "structured" }]);
});
