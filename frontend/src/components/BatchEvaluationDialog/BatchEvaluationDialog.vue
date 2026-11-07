<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery } from "@tanstack/vue-query";
import { X } from "lucide-vue-next";
import { listChecklists } from "../../api/checklists";
import { batchKeys, listBatchOptions, startBatch } from "../../api/batches";
import type { EvaluationBatch } from "../../shared/types/batch";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; started: [batch: EvaluationBatch] }>();
const datasetId = ref(""); const checklistId = ref(""); const versionId = ref(""); const mode = ref<"smoke" | "full">("smoke");
const options = useQuery({ queryKey: batchKeys.options, queryFn: ({ signal }) => listBatchOptions(signal), enabled: computed(() => props.open) });
const checklists = useQuery({ queryKey: ["checklists"], queryFn: ({ signal }) => listChecklists(signal), enabled: computed(() => props.open) });
watch(() => options.data.value, (value) => { if (!datasetId.value && value?.datasets[0]) datasetId.value = value.datasets[0].dataset_group_id; });
watch(() => checklists.data.value, (value) => {
  if (value?.length && !value.some((item) => item.id === checklistId.value)) checklistId.value = value[0]!.id;
  if (!value?.length) checklistId.value = "";
});
watch([checklistId, () => checklists.data.value], ([id, items]) => { versionId.value = items?.find((item) => item.id === id)?.active_version_id ?? ""; }, { immediate: true });
const dataset = computed(() => options.data.value?.datasets.find((item) => item.dataset_group_id === datasetId.value));
const selectedChecklist = computed(() => checklists.data.value?.find((item) => item.id === checklistId.value));
const conversationCount = computed(() => mode.value === "smoke" ? Math.min(3, dataset.value?.conversation_count ?? 0) : dataset.value?.conversation_count ?? 0);
const requestCount = computed(() => conversationCount.value * (selectedChecklist.value?.criterion_count ?? 0));
const mutation = useMutation({
  mutationFn: () => startBatch({ dataset_group_id: datasetId.value, checklist_version_id: versionId.value, ...(mode.value === "smoke" ? { max_conversations: 3 as const } : {}) }),
  onSuccess: (batch) => { emit("started", batch); emit("close"); }
});
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title" @click.self="$emit('close')">
    <div class="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
      <div class="flex items-start justify-between gap-4">
        <div><h2 id="batch-dialog-title" class="text-xl font-bold text-ink">Batch evaluation</h2><p class="mt-1 text-sm text-muted">Choose immutable inputs before any inference begins.</p></div>
        <button class="rounded-lg p-2 text-muted hover:bg-surface" aria-label="Close" @click="$emit('close')"><X :size="20" /></button>
      </div>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-semibold text-ink">Dataset
          <select v-model="datasetId" class="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 font-normal">
            <option v-for="item in options.data.value?.datasets" :key="item.dataset_group_id" :value="item.dataset_group_id">{{ item.dataset_group_id }} ({{ item.conversation_count }})</option>
          </select>
        </label>
        <label class="text-sm font-semibold text-ink">Checklist
          <select v-model="checklistId" class="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 font-normal">
            <option v-for="item in checklists.data.value" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <p class="text-sm text-muted sm:col-span-2">The selected checklist’s current configuration will be used.</p>
      </div>
      <fieldset class="mt-5"><legend class="text-sm font-semibold text-ink">Execution size</legend>
        <div class="mt-2 grid gap-3 sm:grid-cols-2">
          <label class="rounded-xl border p-3" :class="mode === 'smoke' ? 'border-primary bg-primary/5' : 'border-line'"><input v-model="mode" type="radio" value="smoke" class="mr-2" />Smoke test (3 conversations)</label>
          <label class="rounded-xl border p-3" :class="mode === 'full' ? 'border-primary bg-primary/5' : 'border-line'"><input v-model="mode" type="radio" value="full" class="mr-2" />Full dataset (explicit)</label>
        </div>
      </fieldset>
      <div class="mt-5 rounded-xl bg-surface p-4 text-sm text-ink">
        <div class="flex justify-between"><span>Conversations</span><strong>{{ conversationCount }}</strong></div>
        <div class="mt-2 flex justify-between"><span>Estimated criterion requests</span><strong>≈ {{ requestCount }}</strong></div>
        <p class="mt-2 text-xs text-muted">Retries may increase the actual count. Cost cannot be estimated reliably without configured provider pricing.</p>
      </div>
      <p v-if="mutation.error.value" class="mt-4 text-sm text-red-700">{{ mutation.error.value.message }}</p>
      <div class="mt-6 flex justify-end gap-3"><button class="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted" @click="$emit('close')">Cancel</button><button class="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" :disabled="!datasetId || !versionId || mutation.isPending.value" @click="mutation.mutate()">{{ mutation.isPending.value ? 'Starting…' : mode === 'smoke' ? 'Start smoke batch' : `Start all ${conversationCount}` }}</button></div>
    </div>
  </div>
</template>
