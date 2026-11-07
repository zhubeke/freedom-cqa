<script setup lang="ts">
import { Clock3, Pencil, Trash2 } from "lucide-vue-next";
import type { ChecklistSummary } from "../../shared/types/checklist";
defineProps<{ checklist: ChecklistSummary; deleting?: boolean }>();
defineEmits<{ delete: [] }>();
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
</script>
<template>
  <article class="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6" :data-testid="`checklist-card-${checklist.id}`">
    <div class="flex items-start justify-between gap-4"><h2 class="min-w-0 text-xl font-extrabold tracking-tight">{{ checklist.name }}</h2><button type="button" class="icon-button text-red-600 hover:bg-red-50 hover:text-red-700" :disabled="deleting" :aria-label="`Delete ${checklist.name}`" @click="$emit('delete')"><Trash2 :size="19" /></button></div>
    <p class="mt-2 min-h-12 text-sm leading-6 text-muted">{{ checklist.description }}</p>
    <div class="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-3"><div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Criteria</span><strong class="mt-1 block text-xl">{{ checklist.criterion_count }}</strong></div><div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Total weight</span><strong class="mt-1 block text-xl">{{ checklist.total_scoring_weight }} / 100</strong></div><div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Last updated</span><span class="mt-2 inline-flex items-center gap-1.5 font-semibold"><Clock3 :size="14" />{{ formatDate(checklist.updated_at) }}</span></div></div>
    <div class="mt-4 flex flex-wrap gap-2"><RouterLink :to="{ name: 'checklist-edit', params: { id: checklist.id } }" class="button-primary"><Pencil :size="17" /> Edit checklist</RouterLink></div>
  </article>
</template>
