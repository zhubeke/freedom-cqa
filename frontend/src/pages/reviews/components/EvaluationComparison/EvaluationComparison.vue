<script setup lang="ts">
import { computed } from "vue";
import { FileSearch } from "lucide-vue-next";
import type { Appeal } from "../../../../shared/types/appeal";
import { appealOutcome, displayValue, isDecided, outcomeLabel } from "../../review-model";

const props = defineProps<{ appeal: Appeal; finalContribution: number | null; scaleMaximum: number | null }>();
const emit = defineEmits<{ evidence: [source: "original" | "final", reference?: string] }>();
const completed = computed(() => isDecided(props.appeal) && Boolean(props.appeal.decision));
const finalExplanation = computed(() => props.appeal.decision?.effective_explanation === undefined ? props.appeal.original_evaluation.explanation : props.appeal.decision.effective_explanation);
const originalReferences = computed(() => props.appeal.original_evaluation.evidence_message_ids.length
  ? props.appeal.original_evaluation.evidence_message_ids.map((id, index) => ({ key: id, label: `Evidence ${index + 1}` }))
  : props.appeal.original_evaluation.evidence_turns.map(turn => ({ key: `turn:${turn}`, label: `Turn ${turn}` })));
const finalReferences = computed(() => props.appeal.decision?.effective_evidence_message_ids === undefined ? originalReferences.value
  : props.appeal.decision.effective_evidence_message_ids.map((id, index) => ({ key: id, label: `Evidence ${index + 1}` })));
const score = (value: boolean | number | null) => `${displayValue(value)}${typeof value === "number" && props.scaleMaximum !== null ? ` / ${props.scaleMaximum}` : ""}`;
const points = (value: number | null) => value === null ? "N/A" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} pts`;
</script>

<template>
  <section aria-label="Original and final evaluation comparison" class="grid divide-y divide-line overflow-hidden rounded-md border border-line md:grid-cols-2 md:divide-x md:divide-y-0">
    <div class="min-w-0 p-4">
      <h3 class="text-xs font-bold uppercase tracking-wide text-muted">Original evaluation</h3>
      <p class="mt-3 text-2xl font-semibold tabular-nums">{{ score(appeal.original_evaluation.raw_value) }}</p>
      <p v-if="appeal.original_evaluation.answer_type !== 'flag'" class="mt-1 text-xs text-muted">Weighted contribution: <span class="font-medium text-ink">{{ points(appeal.original_evaluation.weighted_contribution) }}</span></p>
      <h4 class="mt-4 text-xs font-semibold">Original rationale</h4><p class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{{ appeal.original_evaluation.explanation || 'No original rationale was recorded.' }}</p>
      <div v-if="originalReferences.length" class="mt-3 flex flex-wrap gap-1.5"><button v-for="reference in originalReferences" :key="reference.key" type="button" class="min-h-8 rounded border border-line px-2 text-xs font-medium hover:bg-surface" @click="emit('evidence', 'original', reference.key)">{{ reference.label }}</button></div>
      <button type="button" class="mt-3 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-slate-700 underline-offset-4 hover:underline" @click="emit('evidence', 'original')"><FileSearch :size="14" />Review evidence</button>
      <p class="mt-3 border-t border-line pt-2 text-xs text-muted">AI evaluation · Immutable original</p>
    </div>
    <div class="min-w-0 p-4" :class="completed && appealOutcome(appeal) !== 'UPHELD' ? 'bg-slate-50/70' : 'bg-surface/30'">
      <h3 class="text-xs font-bold uppercase tracking-wide text-muted">Final decision</h3>
      <template v-if="completed && appeal.decision">
        <p class="mt-3 text-2xl font-semibold tabular-nums">{{ score(appeal.decision.effective_value) }}</p>
        <p v-if="appeal.original_evaluation.answer_type !== 'flag'" class="mt-1 text-xs text-muted">Weighted contribution: <span class="font-medium text-ink">{{ points(finalContribution) }}</span></p>
        <p class="mt-2 text-xs font-semibold text-slate-700">{{ outcomeLabel(appealOutcome(appeal)) }}<span v-if="Object.is(appeal.original_evaluation.raw_value, appeal.decision.effective_value)" class="font-normal text-muted"> · Value unchanged</span></p>
        <h4 class="mt-4 text-xs font-semibold">Reviewer-approved rationale</h4><p class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{{ finalExplanation || 'No evaluation rationale was recorded.' }}</p>
        <div v-if="finalReferences.length" class="mt-3 flex flex-wrap gap-1.5"><button v-for="reference in finalReferences" :key="reference.key" type="button" class="min-h-8 rounded border border-line bg-white px-2 text-xs font-medium hover:bg-surface" @click="emit('evidence', 'final', reference.key)">{{ reference.label }}</button></div>
        <button type="button" class="mt-3 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-slate-700 underline-offset-4 hover:underline" @click="emit('evidence', 'final')"><FileSearch :size="14" />Review evidence</button>
        <p class="mt-3 border-t border-line pt-2 text-xs text-muted">Human review</p>
      </template>
      <div v-else class="flex min-h-40 flex-col justify-center py-5"><p class="text-sm font-semibold">Awaiting reviewer decision</p><p class="mt-2 text-sm leading-6 text-muted">Review the evidence, then record a decision below. The original evaluation remains in effect.</p></div>
    </div>
  </section>
</template>
