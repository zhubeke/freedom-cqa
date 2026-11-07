<script setup lang="ts">
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Download, RotateCw } from "lucide-vue-next";
import { batchKeys, downloadBatch, getBatch, resumeBatch } from "../../api/batches";
const props = defineProps<{ batchId: string }>();
const client = useQueryClient();
const query = useQuery({ queryKey: computed(() => batchKeys.detail(props.batchId)), queryFn: ({ signal }) => getBatch(props.batchId, signal), refetchInterval: (value) => ["completed", "completed_with_errors", "failed", "paused"].includes(value.state.data?.status ?? "") ? false : 1000 });
const resume = useMutation({ mutationFn: () => resumeBatch(props.batchId), onSuccess: () => client.invalidateQueries({ queryKey: batchKeys.detail(props.batchId) }) });
const download = useMutation({ mutationFn: () => downloadBatch(props.batchId) });
const percent = computed(() => query.data.value ? Math.round(100 * (query.data.value.completed + query.data.value.failed) / query.data.value.total) : 0);
const canResume = computed(() => ["paused", "failed"].includes(query.data.value?.status ?? ""));
const canDownload = computed(() => ["completed", "completed_with_errors"].includes(query.data.value?.status ?? "") && !query.data.value?.max_conversations);
</script>

<template>
  <div v-if="query.data.value" class="mb-7 rounded-3xl bg-white p-5 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-sm font-semibold text-primary">Batch evaluation</p><h2 class="mt-1 text-lg font-bold capitalize text-ink">{{ query.data.value.status.replaceAll('_', ' ') }}</h2></div><div class="flex gap-2"><button v-if="canResume" class="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold" @click="resume.mutate()"><RotateCw :size="16" /> Resume</button><button v-if="canDownload" class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" @click="download.mutate()"><Download :size="16" /> Download results.json</button></div></div>
    <div class="mt-5 h-2 overflow-hidden rounded-full bg-surface"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${percent}%` }" /></div>
    <div class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span class="text-muted">Total</span><strong class="ml-2 text-ink">{{ query.data.value.total }}</strong></div><div><span class="text-muted">Completed</span><strong class="ml-2 text-emerald-700">{{ query.data.value.completed }}</strong></div><div><span class="text-muted">Failed</span><strong class="ml-2 text-red-700">{{ query.data.value.failed }}</strong></div><div><span class="text-muted">Remaining</span><strong class="ml-2 text-ink">{{ query.data.value.remaining }}</strong></div></div>
    <p v-if="query.data.value.max_conversations" class="mt-4 text-xs text-muted">Smoke batch: organizer export stays disabled until a complete dataset batch is evaluated.</p>
    <p v-if="download.error.value || resume.error.value" class="mt-3 text-sm text-red-700">{{ download.error.value?.message || resume.error.value?.message }}</p>
  </div>
</template>
