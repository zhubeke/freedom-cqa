<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Download, RotateCw, X } from "lucide-vue-next";
import { batchKeys, downloadBatch, getBatch, resumeBatch } from "../../api/batches";
const props = defineProps<{ batchId: string }>();
const emit = defineEmits<{ dismiss: [] }>();
const client = useQueryClient(); const detailsOpen = ref(false);
const query = useQuery({ queryKey: computed(() => batchKeys.detail(props.batchId)), queryFn: ({ signal }) => getBatch(props.batchId, signal), refetchInterval: (value) => ["completed", "completed_with_errors", "failed", "paused"].includes(value.state.data?.status ?? "") ? false : 1000 });
const resume = useMutation({ mutationFn: () => resumeBatch(props.batchId), onSuccess: () => client.invalidateQueries({ queryKey: batchKeys.detail(props.batchId) }) });
const download = useMutation({ mutationFn: () => downloadBatch(props.batchId) });
const terminal = computed(() => ["completed", "completed_with_errors", "failed"].includes(query.data.value?.status ?? ""));
const percent = computed(() => query.data.value?.total ? Math.round(100 * (query.data.value.completed + query.data.value.failed) / query.data.value.total) : 0);
const canResume = computed(() => ["paused", "failed"].includes(query.data.value?.status ?? ""));
const canDownload = computed(() => ["completed", "completed_with_errors"].includes(query.data.value?.status ?? "") && !query.data.value?.max_conversations);
watch(() => query.data.value?.status, (status, previous) => { if (status && status !== previous && terminal.value) void client.invalidateQueries({ queryKey: ["conversations"] }); });
watch(() => props.batchId, () => { detailsOpen.value = false; download.reset(); resume.reset(); });
</script>

<template>
  <div v-if="query.isError.value" class="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert"><span>{{ query.error.value?.message }}</span><div class="flex gap-2"><button type="button" class="font-semibold underline" @click="query.refetch()">Retry</button><button type="button" aria-label="Dismiss batch notification" @click="emit('dismiss')"><X :size="16" /></button></div></div>
  <section v-else-if="query.data.value" class="mb-3 overflow-hidden rounded-md border text-xs" :class="query.data.value.status === 'failed' ? 'border-red-200 bg-red-50 text-red-800' : query.data.value.status === 'completed_with_errors' ? 'border-amber-200 bg-amber-50 text-amber-900' : query.data.value.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-ink'" aria-label="Batch evaluation status">
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2" role="status" aria-live="polite">
      <p v-if="query.data.value.status === 'completed'"><strong>Batch evaluation complete.</strong> {{ query.data.value.completed }} conversations evaluated.</p>
      <p v-else-if="query.data.value.status === 'completed_with_errors'"><strong>Batch partially completed.</strong> {{ query.data.value.completed }} evaluated; {{ query.data.value.failed }} failed.</p>
      <p v-else-if="query.data.value.status === 'failed'"><strong>Batch evaluation failed.</strong> {{ query.data.value.completed }} completed; {{ query.data.value.failed }} failed. Saved results are preserved.</p>
      <p v-else><strong>Batch evaluation {{ query.data.value.status }}.</strong> {{ query.data.value.completed }} of {{ query.data.value.total }} completed.</p>
      <div class="ml-auto flex items-center gap-2"><button v-if="canDownload" type="button" class="inline-flex min-h-8 items-center gap-1 rounded px-2 font-semibold hover:bg-white/60" :disabled="download.isPending.value" @click="download.mutate()"><Download :size="14" /> Results</button><button v-if="terminal" type="button" class="min-h-8 rounded px-2 font-semibold hover:bg-white/60" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">{{ detailsOpen ? 'Hide details' : 'Details' }}</button><button v-if="terminal" type="button" class="rounded p-2 hover:bg-white/60" aria-label="Dismiss completed batch evaluation" @click="emit('dismiss')"><X :size="16" /></button></div>
    </div>
    <div v-if="!terminal || detailsOpen" class="border-t border-current/10 px-3 py-3"><div class="h-1.5 overflow-hidden rounded bg-black/5" role="progressbar" :aria-valuenow="percent" :aria-valuemin="0" :aria-valuemax="100" aria-label="Finished batch evaluations"><div class="h-full rounded bg-primary transition-all" :style="{ width: `${percent}%` }" /></div><div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"><span>Total <strong>{{ query.data.value.total }}</strong></span><span>Completed <strong>{{ query.data.value.completed }}</strong></span><span>Failed <strong>{{ query.data.value.failed }}</strong></span><span>Remaining <strong>{{ query.data.value.remaining }}</strong></span><button v-if="canResume" type="button" class="ml-auto inline-flex min-h-8 items-center gap-1 rounded border border-line bg-white px-2 font-semibold" :disabled="resume.isPending.value" @click="resume.mutate()"><RotateCw :size="14" /> Resume</button></div><p v-if="query.data.value.last_error" class="mt-2">{{ query.data.value.last_error }}</p><ul v-if="terminal && query.data.value.failed" class="mt-3 space-y-1"><li v-for="item in query.data.value.conversation_results.filter((result) => result.status === 'failed')" :key="item.conversation_id">{{ item.conversation_id }}: {{ item.error || 'Evaluation failed' }}</li></ul></div>
    <p v-if="download.error.value || resume.error.value" class="px-3 pb-3 text-red-700" role="alert">{{ download.error.value?.message || resume.error.value?.message }}</p>
  </section>
</template>
