<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, Check, ChevronDown, CircleMinus, ExternalLink, Minus, ShieldAlert } from "lucide-vue-next";
import type { Appeal } from "../../shared/types/appeal";
import type { ChecklistCriterion } from "../../shared/types/checklist";
import type { TranscriptEntry } from "../../shared/types/conversation";
import type { CriterionEvaluation } from "../../shared/types/evaluation";
import { answerLabel, criterionState, earnedCriterionPoints, isSevereCriterion } from "./criterion-presentation";

const props = withDefaults(defineProps<{
  criterion: CriterionEvaluation;
  configuration?: ChecklistCriterion;
  transcript?: TranscriptEntry[];
  decision?: Appeal["decision"];
  advanced?: boolean;
}>(), { transcript: () => [], decision: null });
const emit = defineEmits<{ evidence: [messageId: string] }>();
const state = computed(() => criterionState(props.criterion, props.configuration, props.decision));
const severe = computed(() => isSevereCriterion(props.criterion, props.configuration));
const value = computed(() => props.decision ? props.decision.effective_value : props.criterion.raw_value);
const earnedPoints = computed(() => earnedCriterionPoints(props.criterion, props.configuration));
const label = computed(() => props.criterion.processing_state === "error" ? "Failed" : props.criterion.processing_state === "retry_scheduled" ? "Waiting" : props.criterion.processing_state !== "completed" ? "Pending" : answerLabel(value.value));
const stateLabels = { full: "Full score", partial: "Partial score", zero: "Needs attention", na: "Not applicable", critical: "Severe violation", clear: "No violation", pending: "Pending", error: "Evaluation failed" };
const evidenceIds = computed(() => props.decision?.effective_evidence_message_ids ?? props.criterion.evidence_message_ids);
const finalExplanation = computed(() => props.decision?.effective_explanation ?? props.decision?.justification ?? props.criterion.explanation);
const evidence = computed(() => {
  const positions = new Map(props.transcript.map((message, index) => [message.message_id, index + 1]));
  return [...new Set(evidenceIds.value)].flatMap((messageId) => {
    const turn = positions.get(messageId);
    return turn === undefined ? [] : [{ messageId, turn }];
  });
});
const missingEvidence = computed(() => new Set(evidenceIds.value).size > evidence.value.length);
const formatPoints = (value: number) => Number.isInteger(value) ? String(value) : String(Math.round((value + Number.EPSILON) * 100) / 100);
</script>

<template>
  <details class="criterion-scorecard rounded-md border bg-white" :class="state === 'critical' || state === 'error' ? 'border-red-200' : state === 'partial' || state === 'zero' ? 'border-amber-200' : 'border-line'">
    <summary class="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <span class="shrink-0" :class="state === 'critical' || state === 'error' ? 'text-red-700' : state === 'full' || state === 'clear' ? 'text-emerald-700' : state === 'partial' || state === 'zero' ? 'text-amber-700' : 'text-muted'">
        <ShieldAlert v-if="state === 'critical'" :size="17" aria-hidden="true" />
        <AlertCircle v-else-if="state === 'error' || state === 'zero'" :size="17" aria-hidden="true" />
        <Check v-else-if="state === 'full' || state === 'clear'" :size="17" aria-hidden="true" />
        <CircleMinus v-else-if="state === 'partial'" :size="17" aria-hidden="true" />
        <Minus v-else :size="17" aria-hidden="true" />
        <span class="sr-only">{{ stateLabels[state] }}.</span>
      </span>
      <span class="min-w-0 flex-1 font-semibold leading-5 text-ink">{{ criterion.criterion_name }}<span v-if="decision" class="ml-2 text-[11px] font-normal text-muted">Reviewed</span></span>
      <span class="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs font-semibold" :class="state === 'critical' ? 'bg-red-50 text-red-700' : 'text-muted'">{{ label }}</span>
      <span v-if="!severe" class="shrink-0 text-right text-xs tabular-nums text-ink" :title="decision ? 'Original model points; reviewer answer shown separately' : 'Earned points / available weight'">
        <span v-if="decision" class="block text-[10px] text-muted">Original</span>
        {{ criterion.is_na ? 'N/A' : earnedPoints === null ? '—' : formatPoints(earnedPoints) }}<span v-if="!criterion.is_na" class="text-muted"> / {{ formatPoints(criterion.weight) }}</span>
      </span>
      <ChevronDown class="scorecard-chevron shrink-0 text-muted transition-transform duration-150" :size="15" aria-hidden="true" />
    </summary>
    <div class="scorecard-body space-y-3 border-t border-line px-3 py-3 text-sm leading-6 text-muted">
      <dl class="flex flex-wrap gap-x-5 gap-y-1 text-xs"><div><dt class="inline font-semibold text-ink">{{ decision ? 'Reviewer answer' : 'Answer' }}: </dt><dd class="inline">{{ label }}</dd></div><div v-if="decision"><dt class="inline font-semibold text-ink">Original answer: </dt><dd class="inline">{{ answerLabel(criterion.raw_value) }}</dd></div></dl>
      <div v-if="decision" class="rounded border border-line bg-surface/50 px-3 py-2"><p class="text-xs font-semibold text-ink">Decision rationale<span v-if="decision.reviewer"> · {{ decision.reviewer }}</span></p><p class="mt-1 whitespace-pre-wrap break-words">{{ decision.justification }}</p><p class="mt-1 text-xs">Original criterion points are preserved above. The overall score includes the finalized review.</p></div>
      <div v-if="decision && finalExplanation"><p class="text-xs font-semibold text-ink">Final explanation</p><p class="mt-1 whitespace-pre-wrap break-words">{{ finalExplanation }}</p></div>
      <div v-if="criterion.explanation"><p class="text-xs font-semibold text-ink">{{ decision ? 'Original explanation' : 'Explanation' }}</p><p class="mt-1 whitespace-pre-wrap break-words">{{ criterion.explanation }}</p></div>
      <p v-if="criterion.na_rationale && criterion.na_rationale !== criterion.explanation" class="whitespace-pre-wrap break-words">{{ criterion.na_rationale }}</p>
      <p v-if="criterion.processing_state === 'error'" class="text-red-700" role="alert">{{ criterion.error || 'Criterion evaluation failed. Retry is available above.' }}</p>
      <div v-if="evidence.length" class="flex flex-wrap items-center gap-2"><span class="text-xs font-semibold text-ink">Evidence</span><button v-for="reference in evidence" :key="reference.messageId" type="button" class="inline-flex min-h-8 items-center gap-1 rounded border border-line px-2 text-xs font-semibold text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="emit('evidence', reference.messageId)"><ExternalLink :size="12" aria-hidden="true" /> Turn {{ reference.turn }}</button></div>
      <p v-else-if="criterion.processing_state === 'completed'" class="text-xs">No verified supporting turn is available.</p>
      <p v-if="missingEvidence" class="text-xs text-amber-800">Some stored evidence could not be matched to this transcript.</p>
      <dl v-if="advanced" class="grid gap-x-4 gap-y-2 border-t border-line pt-3 text-xs sm:grid-cols-2"><div><dt class="font-semibold text-ink">Confidence</dt><dd>{{ criterion.confidence == null ? 'Not available' : `${Math.round(criterion.confidence * 100)}%` }}</dd></div><div><dt class="font-semibold text-ink">Processing time</dt><dd>{{ criterion.latency_ms == null ? 'Not available' : `${criterion.latency_ms} ms` }}</dd></div><div class="min-w-0"><dt class="font-semibold text-ink">Model</dt><dd class="break-words">{{ criterion.model_id }}</dd></div><div><dt class="font-semibold text-ink">Prompt version</dt><dd>{{ criterion.prompt_version }}</dd></div><div><dt class="font-semibold text-ink">Criterion code</dt><dd>{{ criterion.external_code }}</dd></div><div><dt class="font-semibold text-ink">Processing status</dt><dd>{{ criterion.processing_state.replaceAll('_', ' ') }}</dd></div></dl>
    </div>
  </details>
</template>

<style scoped>
summary::-webkit-details-marker { display: none; }
details[open] .scorecard-chevron { transform: rotate(180deg); }
details[open] .scorecard-body { animation: reveal 130ms ease-out; }
@keyframes reveal { from { opacity: .5; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { details[open] .scorecard-body { animation: none; } .scorecard-chevron { transition: none; } }
</style>
