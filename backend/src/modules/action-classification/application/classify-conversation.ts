import type { AppConfig } from "../../../config/config.js";
import type { ClassificationRepository } from "../adapters/persistence/classification-repository.js";
import type { TabPfnAdapter } from "../adapters/tabpfn/tabpfn-adapter.js";
import { ACTION_FEATURE_VERSION, type ClassificationEvent, type TabPfnPrediction } from "./action.types.js";
import { classifyWithRules } from "./deterministic-rules.js";
import { extractActionFeatures } from "./extract-features.js";
import { validateFeatureVector } from "./feature-schema.js";
import { trainingReadiness } from "./training-readiness.js";

export async function classifyConversation(event: ClassificationEvent, repository: ClassificationRepository, adapter: TabPfnAdapter, config: AppConfig) {
  const existing = await repository.findByEvent(event.event_id);
  if (!existing || ["completed", "fallback"].includes(String(existing.status))) return existing;
  const started = await repository.start(event.event_id); if (started.modifiedCount === 0 && existing.status !== "processing") return existing;
  let trainingContext: Record<string, unknown> = {};
  try {
    const input = await repository.inputs(event.dataset_group_id, event.conversation_id);
    if (!input.metadata && !input.evaluation) throw new Error("Classification requires persisted metadata or a completed evaluation");
    const features = extractActionFeatures(input);
    const validationErrors = validateFeatureVector(features); if (validationErrors.length) throw new Error(validationErrors.join("; "));
    const rule = classifyWithRules(features, { semantic: input.metadata?.semantic, criteria: input.criteria });
    await repository.proposeLabel(event.dataset_group_id, event.conversation_id, rule.action, features, existing.result_id);

    const verified = await repository.verifiedLabels({ datasetGroupId: event.dataset_group_id, conversationId: event.conversation_id });
    const readiness = trainingReadiness(verified as any[], config.classification.minPerClass, config.classification.minTotal);
    trainingContext = { training_sample_source: readiness.sample_source, training_sample_count: readiness.eligible_labels.length, training_dataset_version: readiness.dataset_version };
    let prediction: TabPfnPrediction | null = null; let unavailableReason: string | null = null; let model: any = null;
    if (!config.tabpfn.enabled) unavailableReason = "TabPFN is disabled";
    else if (!config.tabpfn.apiKey) unavailableReason = "TABPFN_API_KEY is not configured";
    else if (!readiness.ready) unavailableReason = readiness.reasons.join("; ");
    else {
      model = await repository.readyModel(readiness.dataset_version, config.tabpfn.modelId);
      if (!model) {
        const pending = await repository.latestModel(readiness.dataset_version, config.tabpfn.modelId);
        const fitted = pending?.status === "pending" ? await adapter.fitStatus(pending.fitted_train_set_id) : await adapter.fit(readiness.eligible_labels.map((label: any) => ({ features: label.features, action: label.verified_action })));
        await repository.saveModel({ feature_version: ACTION_FEATURE_VERSION, training_dataset_version: readiness.dataset_version, provider_model_id: config.tabpfn.modelId, fitted_train_set_id: fitted.fitted_train_set_id, status: fitted.status, represented_classes: readiness.represented_classes, training_sample_source: readiness.sample_source, training_sample_count: readiness.eligible_labels.length, training_label_ids: readiness.eligible_labels.map((label: any) => label.label_id ?? String(label._id)), evaluation_metadata: { accuracy: null, note: "Holdout accuracy has not been measured." } });
        if (fitted.status !== "completed") unavailableReason = fitted.status === "failed" ? "TabPFN model training failed" : "TabPFN model training is still running";
        else model = { fitted_train_set_id: fitted.fitted_train_set_id, represented_classes: readiness.represented_classes };
      }
      if (model) prediction = await adapter.predict(model.fitted_train_set_id, features, model.represented_classes);
    }
    const complianceOverride = prediction !== null && rule.action === "COMPLIANCE_REVIEW" && prediction.action !== "COMPLIANCE_REVIEW";
    const finalAction = complianceOverride || !prediction ? rule.action : prediction.action;
    const source = complianceOverride || !prediction ? "rules" : "tabpfn";
    await repository.complete(event.event_id, {
      features, local_rule_prediction: rule, tabpfn_prediction: prediction, final_action: finalAction, classification_source: source,
      ...trainingContext,
      model_id: prediction?.model_id ?? null, model_confidence: prediction?.confidence ?? null,
      override_reason: complianceOverride ? "Confirmed severe violations always override model predictions" : null,
      tabpfn_unavailable_reason: unavailableReason, evidence_message_ids: rule.evidence_message_ids,
      evidence_references: input.evaluation ? [`evaluation_runs/${input.evaluation.run_id}`] : [], error: null
    });
    return repository.findByEvent(event.event_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    // Provider failures fall back to a fresh local result whenever local inputs remain usable.
    try {
      const input = await repository.inputs(event.dataset_group_id, event.conversation_id);
      if (!input.metadata && !input.evaluation) throw new Error("Classification requires persisted metadata or a completed evaluation");
      const features = extractActionFeatures(input);
      const rule = classifyWithRules(features, { semantic: input.metadata?.semantic, criteria: input.criteria });
      if (validateFeatureVector(features).length === 0) {
        await repository.complete(event.event_id, { features, local_rule_prediction: rule, tabpfn_prediction: null, final_action: rule.action, classification_source: "rules", ...trainingContext, model_id: null, model_confidence: null, override_reason: null, tabpfn_unavailable_reason: message, evidence_message_ids: rule.evidence_message_ids, evidence_references: [], error: null });
        return repository.findByEvent(event.event_id);
      }
    } catch { /* persist the original failure below */ }
    await repository.fail(event.event_id, message); throw error;
  }
}
