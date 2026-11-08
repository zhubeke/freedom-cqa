import type { ActionFeatures } from "./action.types.js";
import { ACTION_FEATURE_ORDER } from "./feature-schema.js";

/** Keeps absence explicit. TabPFN receives null/empty CSV cells; rules never coerce missing values to success or zero. */
export function normalizeMissingFeatures(input: Partial<ActionFeatures>): ActionFeatures {
  return Object.fromEntries(ACTION_FEATURE_ORDER.map((key) => [key, input[key] ?? null])) as unknown as ActionFeatures;
}
