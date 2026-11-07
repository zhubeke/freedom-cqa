<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ArrowLeft, Eye, Pencil, Save } from "lucide-vue-next";
import ChecklistEditor from "../../components/ChecklistEditor/ChecklistEditor.vue";
import ChecklistPreview from "../../components/ChecklistPreview/ChecklistPreview.vue";
import WeightSummary from "../../components/WeightSummary/WeightSummary.vue";
import { checklistKeys, getChecklist, updateChecklist } from "../../api/checklists";
import { useHistoryStore } from "../../app/history";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

interface EditorState { name: string; description: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }
const route = useRoute(); const queryClient = useQueryClient(); const history = useHistoryStore();
const checklistId = computed(() => String(route.params.id));
const detailQuery = useQuery({ queryKey: computed(() => checklistKeys.detail(checklistId.value)), queryFn: ({ signal }) => getChecklist(checklistId.value, signal) });
const name = ref(""); const description = ref(""); const sections = ref<ChecklistSection[]>([]); const criteria = ref<ChecklistCriterion[]>([]);
const activeSnapshotId = ref(""); const snapshot = ref(""); const initialized = ref(false); const mode = ref<"edit" | "preview">("edit"); const localError = ref("");
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const currentState = (): EditorState => clone({ name: name.value, description: description.value, sections: sections.value, criteria: criteria.value });
const serialize = (state = currentState()) => JSON.stringify(state);
const applyState = (state: EditorState) => { name.value = state.name; description.value = state.description; sections.value = clone(state.sections); criteria.value = clone(state.criteria); };
watch(() => detailQuery.data.value, (detail) => {
  if (!detail?.active_version || initialized.value) return;
  const state = { name: detail.name, description: detail.description, sections: detail.active_version.sections, criteria: detail.active_version.criteria };
  applyState(state); activeSnapshotId.value = detail.active_version.id; snapshot.value = serialize(state); initialized.value = true;
}, { immediate: true });
watch(() => serialize(), (next, previous) => {
  if (!initialized.value || next === previous) return;
  const before = JSON.parse(previous) as EditorState; const after = JSON.parse(next) as EditorState;
  history.record({ label: "checklist edit", mergeKey: `checklist-edit:${checklistId.value}`, undo: () => applyState(before), redo: () => applyState(after) });
}, { flush: "post" });
const dirty = computed(() => initialized.value && serialize() !== snapshot.value);
const enabledCriteria = computed(() => criteria.value.filter((criterion) => criterion.enabled));
const scoringCriteria = computed(() => enabledCriteria.value.filter((criterion) => criterion.answer_type !== "flag" && criterion.weight > 0));
const totalWeight = computed(() => scoringCriteria.value.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0));
const naCount = computed(() => enabledCriteria.value.filter((criterion) => criterion.na_enabled).length);
const validationError = () => !name.value.trim() ? "Checklist name is required." : totalWeight.value !== 100 ? `Total configured scoring weight must be 100; received ${totalWeight.value}.` : sections.value.some((item) => !item.name.trim()) ? "Every section needs a name." : criteria.value.some((item) => !item.display_name.trim()) ? "Every criterion needs a name." : criteria.value.some((item) => item.na_enabled && !item.na_rule.trim()) ? "Every N/A-enabled criterion needs an applicability rule." : "";
async function persist(state: EditorState) {
  const result = await updateChecklist(checklistId.value, { ...state, expected_active_version_id: activeSnapshotId.value });
  activeSnapshotId.value = result.version.id; applyState(state); snapshot.value = serialize(state);
  queryClient.setQueryData(checklistKeys.detail(checklistId.value), { ...result.checklist, active_version: result.version });
  await queryClient.invalidateQueries({ queryKey: checklistKeys.all });
}
const saveMutation = useMutation({
  mutationFn: async () => { const error = validationError(); if (error) throw new Error(error); const before = JSON.parse(snapshot.value) as EditorState; const after = currentState(); await persist(after); return { before, after }; },
  onSuccess: ({ before, after }) => { localError.value = ""; history.record({ label: "saved checklist", undo: () => persist(before), redo: () => persist(after) }); history.notify("Checklist saved"); },
  onError: (error) => { localError.value = error.message; history.notify(error.message, "error"); }
});
const beforeUnload = (event: BeforeUnloadEvent) => { if (!dirty.value) return; event.preventDefault(); event.returnValue = ""; };
window.addEventListener("beforeunload", beforeUnload); onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
onBeforeRouteLeave(() => !dirty.value || window.confirm("You have unsaved checklist changes. Leave without saving?"));
</script>
<template>
  <section>
    <div v-if="detailQuery.isPending.value" class="h-96 animate-pulse rounded-3xl bg-white" />
    <div v-else-if="detailQuery.isError.value" class="rounded-2xl border border-primary/20 bg-primary-soft p-5 text-primary">{{ detailQuery.error.value?.message }}</div>
    <template v-else-if="detailQuery.data.value?.active_version">
      <header class="mb-6"><RouterLink to="/checklists" class="mb-4 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft :size="17" /> Back to checklists</RouterLink><div class="flex flex-wrap items-end justify-between gap-4"><div><div v-if="dirty" class="text-xs font-semibold text-amber-600">Unsaved changes</div><h1 class="mt-2 text-3xl font-black tracking-tight">Edit checklist</h1><p class="mt-2 text-sm text-muted">Changes apply directly to future evaluations. Existing reports retain their original checklist snapshot.</p></div><button type="button" class="button-primary" :disabled="saveMutation.isPending.value || !dirty" @click="saveMutation.mutate()"><Save :size="18" />{{ saveMutation.isPending.value ? 'Saving…' : 'Save changes' }}</button></div></header>
      <div class="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-4"><div><span class="block text-xs font-bold uppercase text-muted">Criteria</span><strong class="mt-1 block text-xl">{{ enabledCriteria.length }}</strong></div><div><span class="block text-xs font-bold uppercase text-muted">Scoring criteria</span><strong class="mt-1 block text-xl">{{ scoringCriteria.length }}</strong></div><div><span class="block text-xs font-bold uppercase text-muted">Total weight</span><strong class="mt-1 block text-xl">{{ totalWeight }} / 100</strong></div><div><span class="block text-xs font-bold uppercase text-muted">N/A enabled</span><strong class="mt-1 block text-xl">{{ naCount }}</strong></div></div>
      <div v-if="localError" class="mb-5 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">{{ localError }}</div>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"><div class="min-w-0 space-y-5"><div class="rounded-2xl border border-line bg-white p-5 shadow-sm"><div class="grid gap-4"><label class="label">Checklist name<input v-model="name" class="field mt-1.5" /></label><label class="label">Description<textarea v-model="description" class="field mt-1.5 min-h-20 resize-y" /></label></div></div><div class="flex rounded-xl bg-surface-strong p-1 sm:w-fit"><button type="button" class="tab-button" :class="{ 'tab-button-active': mode === 'edit' }" @click="mode = 'edit'"><Pencil :size="16" /> Edit configuration</button><button type="button" class="tab-button" :class="{ 'tab-button-active': mode === 'preview' }" @click="mode = 'preview'"><Eye :size="16" /> Evaluator preview</button></div><ChecklistEditor v-if="mode === 'edit'" v-model:sections="sections" v-model:criteria="criteria" /><ChecklistPreview v-else :sections="sections" :criteria="criteria" /></div><WeightSummary class="lg:sticky lg:top-24 lg:self-start" :criteria="criteria" :sections="sections" /></div>
    </template>
  </section>
</template>
