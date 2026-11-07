<script setup lang="ts">
import { ArrowRight, Clock3, FilePenLine, Pencil } from "lucide-vue-next";
import type { ChecklistSummary } from "../../shared/types/checklist";
defineProps<{ checklist: ChecklistSummary; featured?: boolean }>();
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
</script>
<template>
  <article class="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6" :class="featured ? 'border-primary/25 md:col-span-2' : 'border-line'" :data-testid="`checklist-card-${checklist.id}`">
    <div class="flex items-start justify-between gap-4"><div class="min-w-0"><span class="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">Active v{{ checklist.active_version_number ?? '—' }}</span><h2 class="mt-3 text-xl font-extrabold tracking-tight">{{ checklist.name }}</h2></div><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-primary"><FilePenLine :size="21" /></div></div>
    <p class="mt-2 min-h-12 text-sm leading-6 text-muted">{{ checklist.description }}</p>
    <div class="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-3">
      <div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Criteria</span><strong class="mt-1 block text-xl">{{ checklist.criterion_count }}</strong></div>
      <div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Total weight</span><strong class="mt-1 block text-xl">{{ checklist.total_scoring_weight }} / 100</strong></div>
      <div><span class="block text-xs font-bold uppercase tracking-wide text-muted">Last updated</span><span class="mt-2 inline-flex items-center gap-1.5 font-semibold"><Clock3 :size="14" />{{ formatDate(checklist.updated_at) }}</span></div>
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <RouterLink v-if="checklist.active_version_id" :to="`/checklists/${checklist.id}/versions/${checklist.active_version_id}`" class="button-primary" :class="{ 'sm:min-w-44': featured }">View checklist <ArrowRight :size="17" /></RouterLink>
      <RouterLink v-if="checklist.active_version_id" :to="{ path: `/checklists/${checklist.id}/edit`, query: { from: checklist.active_version_id } }" class="button-secondary"><Pencil :size="17" /> Edit checklist</RouterLink>
    </div>
  </article>
</template>
