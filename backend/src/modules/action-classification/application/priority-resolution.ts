import type { RulePrediction } from "./action.types.js";

export function resolveRulePriority(matches: Array<RulePrediction | null>, fallback: RulePrediction): RulePrediction {
  return matches.filter((item): item is RulePrediction => item !== null).sort((left, right) => left.priority - right.priority || left.rule_id.localeCompare(right.rule_id))[0] ?? fallback;
}
