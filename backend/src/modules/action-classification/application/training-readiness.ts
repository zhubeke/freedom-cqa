import { createHash } from "node:crypto";
import type { ActionCode } from "./action.types.js";

export interface VerifiedLabel { _id?: unknown; verified_action?: ActionCode; feature_version: string; features?: Record<string, unknown> }
export function trainingReadiness(labels: VerifiedLabel[], minimumPerClass: number, minimumTotal: number) {
  const counts = labels.reduce<Partial<Record<ActionCode, number>>>((result, label) => {
    if (label.verified_action) result[label.verified_action] = (result[label.verified_action] ?? 0) + 1;
    return result;
  }, {});
  const represented = Object.entries(counts).filter(([, count]) => (count ?? 0) >= minimumPerClass).map(([code]) => code as ActionCode);
  const eligible = labels.filter((label) => label.verified_action && represented.includes(label.verified_action));
  const reasons: string[] = [];
  if (represented.length < 2) reasons.push(`At least two classes with ${minimumPerClass} verified labels each are required`);
  if (eligible.length < minimumTotal) reasons.push(`At least ${minimumTotal} eligible verified labels are required`);
  const datasetVersion = createHash("sha256").update(eligible.map((item) => `${String(item._id)}:${item.verified_action}:${item.feature_version}`).sort().join("|")).digest("hex");
  return { ready: reasons.length === 0, reasons, counts, represented_classes: represented, eligible_labels: eligible, dataset_version: datasetVersion };
}
