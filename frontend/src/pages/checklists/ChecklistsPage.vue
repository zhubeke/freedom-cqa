<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ClipboardList, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import ConversationMenu from "../../components/ConversationMenu/ConversationMenu.vue";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog.vue";
import { checklistKeys, createChecklist, deleteChecklist, duplicateChecklist, listChecklists, setChecklistStatus } from "../../api/checklists";
import { useHistoryStore } from "../../app/history";
import type { ChecklistCriterion, ChecklistSection, ChecklistSummary } from "../../shared/types/checklist";

const router = useRouter();
const queryClient = useQueryClient();
const history = useHistoryStore();
const search = ref(sessionStorage.getItem("cqa:checklist-search") ?? "");
watch(search, value => sessionStorage.setItem("cqa:checklist-search", value));
const pendingDelete = ref<ChecklistSummary | null>(null);
const query = useQuery({ queryKey: checklistKeys.all, queryFn: ({ signal }) => listChecklists(signal) });
const orderedChecklists = computed(() => [...(query.data.value ?? [])].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()));
const visibleChecklists = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return orderedChecklists.value.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(term));
});
const refresh = () => queryClient.invalidateQueries({ queryKey: checklistKeys.all });
const notifyError = (error: Error) => history.notify(error.message, "error");
const createMutation = useMutation({
  mutationFn: () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const section: ChecklistSection = { id: crypto.randomUUID(), display_order: 1, name: "Quality criteria" };
    const criterion: ChecklistCriterion = { id: crypto.randomUUID(), code: "01", display_order: 1, section_id: section.id, source_name: "", display_name: "New criterion", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 100, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true };
    return createChecklist({ name: `New Quality Checklist ${suffix}`, description: "Configure this checklist for your evaluation workflow.", sections: [section], criteria: [criterion] });
  },
  onSuccess: async ({ checklist }) => { await refresh(); history.notify("Checklist created"); await router.push({ name: "checklist-edit", params: { id: checklist.id } }); },
  onError: notifyError
});
const duplicateMutation = useMutation({
  mutationFn: (item: ChecklistSummary) => duplicateChecklist(item.id),
  onSuccess: async ({ checklist }) => { await refresh(); history.notify("Independent checklist copy created · Inactive"); await router.push({ name: "checklist-edit", params: { id: checklist.id } }); },
  onError: notifyError
});
const statusMutation = useMutation({
  mutationFn: (item: ChecklistSummary) => setChecklistStatus(item.id, item.is_active === false),
  onSuccess: async item => { await refresh(); history.notify(`${item.name} ${item.is_active === false ? 'deactivated' : 'activated'}`); },
  onError: notifyError
});
const deleteMutation = useMutation({
  mutationFn: (item: ChecklistSummary) => deleteChecklist(item.id),
  onSuccess: async (_, item) => { pendingDelete.value = null; await refresh(); history.notify(`Deleted ${item.name}`); },
  onError: notifyError
});
const busy = computed(() => createMutation.isPending.value || duplicateMutation.isPending.value || statusMutation.isPending.value || deleteMutation.isPending.value);
function menuItems(item: ChecklistSummary) {
  const active = item.is_active !== false;
  return [
    { id: "edit", label: "Edit", disabled: busy.value },
    { id: "duplicate", label: "Duplicate", disabled: busy.value },
    { id: "status", label: active ? "Deactivate" : "Activate", disabled: busy.value || (active && item.can_deactivate === false) },
    { id: "delete", label: item.can_delete === false ? "Delete (protected)" : active ? "Delete (deactivate first)" : "Delete", destructive: true, disabled: busy.value || active || item.can_delete === false }
  ];
}
function action(id: string, item: ChecklistSummary) {
  if (busy.value) return;
  if (id === "edit") void router.push({ name: "checklist-edit", params: { id: item.id } });
  if (id === "duplicate") duplicateMutation.mutate(item);
  if (id === "status") statusMutation.mutate(item);
  if (id === "delete" && item.is_active === false && item.can_delete !== false) pendingDelete.value = item;
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}
</script>

<template>
  <section class="checklist-management mx-auto w-full max-w-[1280px]">
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-bold tracking-tight">Checklists</h1><p class="mt-1 text-sm text-muted">Manage quality evaluation configurations.</p></div>
      <button type="button" class="button-primary !min-h-10 !rounded-lg" :disabled="busy" @click="createMutation.mutate()"><LoaderCircle v-if="createMutation.isPending.value" :size="17" class="animate-spin" /><Plus v-else :size="17" />Create checklist</button>
    </header>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="relative w-full max-w-md"><Search :size="17" class="pointer-events-none absolute left-3 top-3 text-muted" /><input v-model="search" type="search" aria-label="Search checklists by name or description" placeholder="Search checklists…" class="field !rounded-lg !py-2.5 !pl-9 !pr-10" /><button v-if="search" type="button" class="absolute right-1 top-1 grid size-8 place-items-center rounded text-muted hover:bg-surface" aria-label="Clear checklist search" @click="search = ''"><X :size="16" /></button></div>
      <div class="flex items-center gap-3 text-xs text-muted"><span aria-live="polite">{{ visibleChecklists.length }} checklist{{ visibleChecklists.length === 1 ? '' : 's' }}</span><button type="button" class="icon-button !size-8 !rounded-md" aria-label="Refresh checklists" :disabled="query.isFetching.value" @click="query.refetch()"><RefreshCw :size="15" :class="{ 'animate-spin': query.isFetching.value }" /></button></div>
    </div>
    <p class="mb-3 text-xs text-muted">Active checklists are available for new evaluations. Multiple checklists can be active.</p>
    <div v-if="query.isPending.value" role="status" class="rounded-lg border border-line bg-white p-6 text-sm text-muted"><LoaderCircle :size="18" class="mr-2 inline animate-spin" />Loading checklists…</div>
    <div v-else-if="query.isError.value" role="alert" class="rounded-lg border border-amber-200 bg-amber-50 p-5"><h2 class="font-semibold text-ink">Couldn’t load checklists</h2><p class="mt-1 text-sm text-muted">{{ query.error.value?.message }}</p><button type="button" class="button-secondary mt-3 !min-h-9 !rounded-md" @click="query.refetch()">Try again</button></div>
    <div v-else-if="visibleChecklists.length" class="overflow-hidden rounded-lg border border-line bg-white">
      <table class="checklist-table w-full text-left text-sm">
        <thead class="border-b border-line bg-surface/60 text-[11px] uppercase tracking-wide text-muted"><tr><th scope="col">Name</th><th scope="col" class="numeric-col">Criteria</th><th scope="col" class="numeric-col">Weight</th><th scope="col" class="modified-col">Modified</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody><tr v-for="item in visibleChecklists" :key="item.id" class="border-b border-line last:border-0 hover:bg-surface/40"><th scope="row" class="min-w-0 font-normal"><RouterLink :to="{ name: 'checklist-edit', params: { id: item.id } }" class="block truncate font-semibold text-ink hover:underline" :title="item.name">{{ item.name }}</RouterLink><p v-if="item.description" class="mt-0.5 truncate text-xs text-muted" :title="item.description">{{ item.description }}</p><span class="mobile-details mt-1 text-xs text-muted">{{ item.enabled_criterion_count ?? item.criterion_count }} enabled · {{ item.total_scoring_weight }}/100 pts · {{ date(item.updated_at) }}</span></th><td class="numeric-col tabular-nums">{{ item.enabled_criterion_count ?? item.criterion_count }}<span class="sr-only"> enabled criteria</span></td><td class="numeric-col whitespace-nowrap tabular-nums">{{ item.total_scoring_weight }}<span class="text-muted"> / 100</span></td><td class="modified-col whitespace-nowrap text-xs text-muted"><time :datetime="item.updated_at">{{ date(item.updated_at) }}</time></td><td><span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold" :class="item.is_active === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'"><span class="size-1.5 rounded-full bg-current" aria-hidden="true" />{{ item.is_active === false ? 'Inactive' : 'Active' }}</span></td><td class="!pl-0 text-right"><ConversationMenu :label="`Actions for ${item.name}`" :items="menuItems(item)" @select="action($event, item)" /></td></tr></tbody>
      </table>
    </div>
    <div v-else class="rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center"><ClipboardList class="mx-auto text-muted" :size="28" /><h2 class="mt-3 font-semibold">{{ orderedChecklists.length ? 'No matching checklists' : 'No checklists yet' }}</h2><p class="mt-1 text-sm text-muted">{{ orderedChecklists.length ? 'Try a different name or description.' : 'Create your first quality evaluation configuration.' }}</p><button v-if="orderedChecklists.length" type="button" class="button-secondary mt-4 !min-h-9 !rounded-md" @click="search = ''">Clear search</button><button v-else type="button" class="button-primary mt-4 !min-h-9 !rounded-md" :disabled="busy" @click="createMutation.mutate()">Create checklist</button></div>
    <ConfirmDialog v-if="pendingDelete" title="Delete checklist?" confirm-label="Delete checklist" :busy="deleteMutation.isPending.value" danger @cancel="pendingDelete = null" @confirm="deleteMutation.mutate(pendingDelete)"><p><strong class="text-ink">{{ pendingDelete.name }}</strong> will be removed from the checklist list. Historical evaluation reports and checklist snapshots are preserved.</p><p v-if="deleteMutation.error.value" role="alert" class="mt-2 text-red-700">{{ deleteMutation.error.value.message }}</p></ConfirmDialog>
  </section>
</template>

<style scoped>
.checklist-table { table-layout: fixed; }
.checklist-table th, .checklist-table td { padding: .75rem 1rem; vertical-align: middle; }
.checklist-table th:first-child { width: 43%; }
.checklist-table th:last-child { width: 3.25rem; }
.mobile-details { display: none; }
input[type="search"]::-webkit-search-cancel-button { display: none; }
@media (max-width: 900px) { .modified-col { display: none; } .checklist-table th:first-child { width: 48%; } }
@media (max-width: 640px) { .numeric-col { display: none; } .mobile-details { display: block; } .checklist-table th:first-child { width: auto; } .checklist-table th, .checklist-table td { padding: .75rem .625rem; } .checklist-table th:nth-last-child(2) { width: 5.5rem; } }
</style>
