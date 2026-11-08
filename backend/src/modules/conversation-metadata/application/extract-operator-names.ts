interface OperatorMessage { message_id?: string; speaker?: string; text?: string }

export interface IdentifiedOperator {
  name: string;
  evidence_message_id: string | null;
  source: "structured" | "transcript";
}

const HIDDEN = /^(?:\[.*(?:скрыт|hidden|redact).*\]|(?:unknown|неизвестно|не определено))$/iu;
const INTRODUCTIONS = [
  /(?:меня\s+зовут|мо[её]\s+имя)\s+([\p{L}][\p{L}'’-]{1,39})/iu,
  /(?:мен(?:ің|ин)\s+атым)\s+([\p{L}][\p{L}'’-]{1,39})/iu,
  /(?:i\s+am|i['’]?m|my\s+name\s+is)\s+([\p{L}][\p{L}'’-]{1,39})(?=\s|[,.!?]|$)/iu
];

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[.,!?;:]+$/u, "");
  if (!name || HIDDEN.test(name) || name.length > 40) return null;
  return name[0]!.toLocaleUpperCase() + name.slice(1);
}

export function extractOperatorNames(transcript: OperatorMessage[], structured: unknown = []): IdentifiedOperator[] {
  const found = new Map<string, IdentifiedOperator>();
  for (const item of (Array.isArray(structured) ? structured : [structured])) {
    const raw = typeof item === "object" && item !== null && "name" in item ? (item as { name?: unknown }).name : item;
    const name = cleanName(raw);
    if (name) found.set(name.toLocaleLowerCase(), { name, evidence_message_id: null, source: "structured" });
  }
  for (const message of transcript) {
    if (message.speaker !== "operator" || typeof message.text !== "string") continue;
    for (const pattern of INTRODUCTIONS) {
      const name = cleanName(pattern.exec(message.text)?.[1]);
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      if (!found.has(key)) found.set(key, { name, evidence_message_id: message.message_id ?? null, source: "transcript" });
      break;
    }
  }
  return [...found.values()];
}
