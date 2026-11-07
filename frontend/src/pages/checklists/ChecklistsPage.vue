<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ClipboardList, Plus, Trash2, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import ChecklistCard from "../../components/ChecklistCard/ChecklistCard.vue";
import { checklistKeys, createChecklist, deleteChecklist, listChecklists } from "../../api/checklists";
import { useHistoryStore } from "../../app/history";
import type { ChecklistCriterion, ChecklistSection, ChecklistSummary } from "../../shared/types/checklist";

type ChecklistFilter = "all" | "default" | "custom";
const router = useRouter(); const queryClient = useQueryClient(); const history = useHistoryStore();
const filter = ref<ChecklistFilter>("all"); const pendingDelete = ref<ChecklistSummary | null>(null);
const query = useQuery({ queryKey: checklistKeys.all, queryFn: ({ signal }) => listChecklists(signal) });
const orderedChecklists = computed(() => [...(query.data.value ?? [])].sort((left, right) => {
  if (left.id === "freedom-default-checklist") return -1;
  if (right.id === "freedom-default-checklist") return 1;
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}));
const visibleChecklists = computed(() => orderedChecklists.value.filter((item) => filter.value === "all" || (filter.value === "default") === (item.id === "freedom-default-checklist")));
watch(filter, (next, previous) => history.record({ label: "checklist filter", undo: () => { filter.value = previous; }, redo: () => { filter.value = next; } }));
const createMutation = useMutation({
  mutationFn: () => { const suffix = `${new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date())} · ${crypto.randomUUID().slice(0, 4)}`; const section: ChecklistSection = { id: crypto.randomUUID(), display_order: 1, name: "Quality criteria" }; const criterion: ChecklistCriterion = { id: crypto.randomUUID(), code: "01", display_order: 1, section_id: section.id, source_name: "", display_name: "New criterion", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 100, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true }; return createChecklist({ name: `New Quality Checklist ${suffix}`, description: "Configure this checklist for your evaluation workflow.", sections: [section], criteria: [criterion] }); },
  onSuccess: async ({ checklist }) => { await queryClient.invalidateQueries({ queryKey: checklistKeys.all }); history.notify("Checklist created"); await router.push({ name: "checklist-edit", params: { id: checklist.id } }); },
  onError: (error) => history.notify(error.message, "error")
});
const deleteMutation = useMutation({
  mutationFn: (checklist: ChecklistSummary) => deleteChecklist(checklist.id),
  onSuccess: async (_, checklist) => { pendingDelete.value = null; await queryClient.invalidateQueries({ queryKey: checklistKeys.all }); history.notify(`Deleted ${checklist.name}`); },
  onError: (error) => history.notify(error.message, "error")
});
</script>
<template>
  <section>
    <header class="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div class="mb-2 inline-flex items-center gap-2 text-sm font-bold text-primary"><ClipboardList :size="18" /> Quality configuration</div><h1 class="text-3xl font-black tracking-tight sm:text-4xl">Checklists</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Build and maintain evaluation criteria while historical reports keep their original snapshots.</p></div><button type="button" class="button-primary" :disabled="createMutation.isPending.value" @click="createMutation.mutate()"><Plus :size="18" />{{ createMutation.isPending.value ? 'Creating…' : 'Create checklist' }}</button></header>
    <div class="mb-5 flex w-full rounded-xl bg-surface-strong p-1 sm:w-fit" role="tablist" aria-label="Checklist filter"><button v-for="item in ([['all','All'],['default','Default'],['custom','Custom']] as const)" :key="item[0]" type="button" role="tab" :aria-selected="filter === item[0]" class="tab-button flex-1 sm:flex-none" :class="{ 'tab-button-active': filter === item[0] }" @click="filter = item[0]">{{ item[1] }}</button></div>
    <div v-if="query.isPending.value" class="grid gap-4 md:grid-cols-2"><div v-for="item in 2" :key="item" class="h-64 animate-pulse rounded-2xl bg-white" /></div>
    <div v-else-if="query.isError.value" class="rounded-2xl border border-primary/20 bg-primary-soft p-5 text-sm text-primary">{{ query.error.value?.message }} <button class="ml-2 font-bold underline" @click="query.refetch()">Try again</button></div>
    <div v-else-if="visibleChecklists.length" class="grid gap-4 md:grid-cols-2"><ChecklistCard v-for="checklist in visibleChecklists" :key="checklist.id" :checklist="checklist" :deleting="deleteMutation.isPending.value && pendingDelete?.id === checklist.id" @delete="pendingDelete = checklist" /></div>
    <div v-else class="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center"><h2 class="font-bold">{{ orderedChecklists.length ? 'No checklists match this filter' : 'No checklists yet' }}</h2><p class="mt-2 text-sm text-muted">{{ orderedChecklists.length ? 'Choose another filter to see available checklists.' : 'Create a checklist to start evaluating conversations.' }}</p></div>
    <div v-if="pendingDelete" class="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-checklist-title" @click.self="pendingDelete = null"><div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div class="flex items-start justify-between gap-4"><div><h2 id="delete-checklist-title" class="text-xl font-extrabold">Delete checklist?</h2><p class="mt-2 text-sm leading-6 text-muted">{{ pendingDelete.name }} will be removed from active workflows. Existing evaluation reports keep their historical snapshot.</p></div><button type="button" class="icon-button" aria-label="Close" @click="pendingDelete = null"><X :size="20" /></button></div><div class="mt-6 flex justify-end gap-3"><button type="button" class="button-secondary" :disabled="deleteMutation.isPending.value" @click="pendingDelete = null">Cancel</button><button type="button" class="button-primary bg-red-600 hover:bg-red-700" :disabled="deleteMutation.isPending.value" @click="deleteMutation.mutate(pendingDelete)"><Trash2 :size="17" />{{ deleteMutation.isPending.value ? 'Deleting…' : 'Delete' }}</button></div></div></div>
  </section>
</template>
