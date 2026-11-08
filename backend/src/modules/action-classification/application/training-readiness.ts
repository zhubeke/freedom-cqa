import { createHash } from "node:crypto";
import { ACTION_CODES, ACTION_FEATURE_VERSION, type ActionCode, type ActionFeatures } from "./action.types.js";
import { approvedFeatureRow, validateFeatureVector } from "./feature-schema.js";

export interface VerifiedLabel {
  _id?: unknown; label_id?: string; dataset_group_id?: string; conversation_id?: string;
  verified_action?: ActionCode; feature_version: string; features?: Record<string, unknown>;
}
export function trainingReadiness(labels: VerifiedLabel[], minimumPerClass: number, minimumTotal: number) {
  // Use one validated, persisted sample per conversation. Rule proposals and
  // incomplete or obsolete feature snapshots must never become ground truth.
  const seen = new Set<string>();
  const valid = labels.filter((label) => {
    if (label.feature_version !== ACTION_FEATURE_VERSION || !ACTION_CODES.includes(label.verified_action as ActionCode)
      || !label.features || validateFeatureVector(label.features as unknown as ActionFeatures).length) return false;
    const identity = label.dataset_group_id && label.conversation_id
      ? `${label.dataset_group_id}:${label.conversation_id}` : label.label_id ?? (label._id == null ? null : String(label._id));
    if (!identity || seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  const counts = valid.reduce<Partial<Record<ActionCode, number>>>((result, label) => {
    if (label.verified_action) result[label.verified_action] = (result[label.verified_action] ?? 0) + 1;
    return result;
  }, {});
  const represented = Object.entries(counts).filter(([, count]) => (count ?? 0) >= minimumPerClass).map(([code]) => code as ActionCode);
  const eligible = valid.filter((label) => label.verified_action && represented.includes(label.verified_action));
  const reasons: string[] = [];
  if (represented.length < 2) reasons.push(`At least two classes with ${minimumPerClass} verified labels each are required`);
  if (eligible.length < minimumTotal) reasons.push(`At least ${minimumTotal} eligible verified labels are required`);
  const datasetVersion = createHash("sha256").update(eligible.map((item) => JSON.stringify([
    item.label_id ?? String(item._id), item.dataset_group_id, item.conversation_id,
    item.verified_action, item.feature_version, approvedFeatureRow(item.features as unknown as ActionFeatures)
  ])).sort().join("|")).digest("hex");
  return { ready: reasons.length === 0, reasons, counts, represented_classes: represented, eligible_labels: eligible,
    dataset_version: datasetVersion, sample_source: "classification_labels" as const, verified_total: labels.length, rejected_total: labels.length - valid.length };
}
