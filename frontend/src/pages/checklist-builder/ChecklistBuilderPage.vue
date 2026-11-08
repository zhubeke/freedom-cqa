<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import { ArrowLeft, Eye, LoaderCircle, Pencil, Save } from "lucide-vue-next";
import ChecklistEditor from "../../components/ChecklistEditor/ChecklistEditor.vue";
import ChecklistPreview from "../../components/ChecklistPreview/ChecklistPreview.vue";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog.vue";
import WeightSummary from "../../components/WeightSummary/WeightSummary.vue";
import { checklistKeys, getChecklist, updateChecklist } from "../../api/checklists";
import { useHistoryStore } from "../../app/history";
import { scoringWeight, validateChecklistDraft, type ChecklistValidationIssue } from "../../shared/checklist-validation";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";
interface EditorState { name: string; description: string; sections: ChecklistSection[]; criteria: ChecklistCriterion[] }
const route = useRoute(); const router = useRouter(); const queryClient = useQueryClient(); const history = useHistoryStore();
const checklistId = computed(() => String(route.params.id));
const detailQuery = useQuery({ queryKey: computed(() => checklistKeys.detail(checklistId.value)), queryFn: ({ signal }) => getChecklist(checklistId.value, signal) });
const name = ref(""); const description = ref(""); const sections = ref<ChecklistSection[]>([]); const criteria = ref<ChecklistCriterion[]>([]);
const activeSnapshotId = ref(""); const snapshot = ref(""); const initialized = ref(false); const mode = ref<"edit" | "preview">("edit"); const localError = ref("");
const editor = ref<InstanceType<typeof ChecklistEditor>>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const currentState = (): EditorState => clone({ name: name.value, description: description.value, sections: sections.value, criteria: criteria.value });
const serialize = (state = currentState()) => JSON.stringify(state);
const applyState = (state: EditorState) => { name.value = state.name; description.value = state.description; sections.value = clone(state.sections); criteria.value = clone(state.criteria); };
watch(checklistId, () => { initialized.value = false; snapshot.value = ""; localError.value = ""; mode.value = "edit"; });
watch(() => detailQuery.data.value, (detail) => {
  if (!detail?.active_version || initialized.value || detail.id !== checklistId.value) return;
  const state = { name: detail.name, description: detail.description, sections: detail.active_version.sections, criteria: detail.active_version.criteria };
  applyState(state); activeSnapshotId.value = detail.active_version.id; snapshot.value = serialize(state); initialized.value = true;
}, { immediate: true });
watch(() => serialize(), (next, previous) => {
  if (!initialized.value || next === previous || !previous || next === snapshot.value) return;
  const before = JSON.parse(previous) as EditorState; const after = JSON.parse(next) as EditorState;
  history.record({ label: "checklist edit", mergeKey: `checklist-edit:${checklistId.value}`, undo: () => applyState(before), redo: () => applyState(after) });
}, { flush: "post" });
const dirty = computed(() => initialized.value && serialize() !== snapshot.value);
const totalWeight = computed(() => scoringWeight(criteria.value));
const issues = computed(() => validateChecklistDraft(name.value, sections.value, criteria.value));
async function persist(state: EditorState) {
  const id = checklistId.value;
  const result = await updateChecklist(id, { ...state, expected_active_version_id: activeSnapshotId.value });
  activeSnapshotId.value = result.version.id;
  // A saved baseline never overwrites a later draft edit.
  snapshot.value = serialize(state);
  queryClient.setQueryData(checklistKeys.detail(id), { ...result.checklist, active_version: result.version });
  await queryClient.invalidateQueries({ queryKey: checklistKeys.all });
}
const saveMutation = useMutation({
  mutationFn: async () => { if (issues.value.length) throw new Error(issues.value[0]!.message); if (!dirty.value) return; await persist(currentState()); },
  onSuccess: () => { localError.value = ""; history.notify("Checklist saved as a new version"); },
  onError: (error) => { localError.value = error.message; history.notify(error.message, "error"); }
});
const confirmLeave = ref(false);
let resolveLeave: ((allow: boolean) => void) | null = null;
function navigationGuard() { if (saveMutation.isPending.value) return false; if (!dirty.value) return true; if (resolveLeave) return false; confirmLeave.value = true; return new Promise<boolean>((resolve) => { resolveLeave = resolve; }); }
function finishNavigation(discard: boolean) { confirmLeave.value = false; const resolve = resolveLeave; resolveLeave = null; resolve?.(discard); }
onBeforeRouteLeave(navigationGuard);
onBeforeRouteUpdate((to, from) => to.params.id !== from.params.id ? navigationGuard() : true);
const beforeUnload = (event: BeforeUnloadEvent) => { if (!dirty.value) return; event.preventDefault(); event.returnValue = ""; };
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => { window.removeEventListener("beforeunload", beforeUnload); resolveLeave?.(false); });
async function navigateIssue(issue: ChecklistValidationIssue) {
  if (issue.field === "name") { const field = document.getElementById("checklist-name"); field?.scrollIntoView({ block: "center" }); field?.focus({ preventScroll: true }); return; }
  mode.value = "edit"; await nextTick();
  if (issue.criterionId || issue.sectionId) await editor.value?.revealIssue(issue);
  else document.getElementById("checklist-sections")?.scrollIntoView({ block: "center" });
}
function showValidation() { const panel = document.getElementById("checklist-validation") as HTMLDetailsElement | null; if (panel) { panel.open = true; panel.scrollIntoView({ block: "center" }); panel.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); } }
</script>
<template>
  <section class="mx-auto max-w-[1280px] pb-3">
    <div v-if="detailQuery.isPending.value" class="h-64 animate-pulse rounded-lg bg-white" aria-label="Loading checklist" />
    <div v-else-if="detailQuery.isError.value" class="rounded-lg border border-red-200 bg-white p-5 text-sm" role="alert"><h1 class="font-bold text-red-800">Unable to load checklist</h1><p class="mt-2 text-muted">{{ detailQuery.error.value?.message }}</p><button type="button" class="button-secondary mt-3" @click="detailQuery.refetch()">Try again</button></div>
    <template v-else-if="detailQuery.data.value?.active_version">
      <header class="mb-5"><RouterLink to="/checklists" class="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"><ArrowLeft :size="15" /> Back to checklists</RouterLink><div class="flex flex-wrap items-center justify-between gap-2"><h1 class="text-2xl font-bold tracking-tight">Edit checklist</h1><span class="text-xs text-muted">Version {{ detailQuery.data.value.active_version.version_number }}</span></div><p class="mt-1 text-sm text-muted">Configure future evaluations. Saving creates a new version; historical reports keep their original snapshot.</p></header>
      <div v-if="localError" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ localError }}</div>
      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <WeightSummary class="order-first lg:order-last lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1" :criteria="criteria" :sections="sections" :issues="issues" @navigate="navigateIssue" />
        <div class="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <div class="grid gap-3 rounded-lg border border-line bg-white p-4"><label class="label">Checklist name<input id="checklist-name" v-model="name" :disabled="saveMutation.isPending.value" :aria-invalid="!name.trim() || undefined" class="field mt-1 !rounded-md !py-2" /></label><label class="label">Description<textarea v-model="description" :disabled="saveMutation.isPending.value" rows="2" class="field mt-1 resize-y !rounded-md !py-2" /></label></div>
          <div class="flex w-fit flex-wrap gap-1 rounded-lg bg-surface-strong p-1" role="tablist" aria-label="Editor view"><button type="button" role="tab" :aria-selected="mode === 'edit'" class="tab-button !min-h-8 !rounded-md !px-3 !text-xs" :class="{ 'tab-button-active': mode === 'edit' }" @click="mode = 'edit'"><Pencil :size="14" /> Edit configuration</button><button type="button" role="tab" :aria-selected="mode === 'preview'" class="tab-button !min-h-8 !rounded-md !px-3 !text-xs" :class="{ 'tab-button-active': mode === 'preview' }" @click="mode = 'preview'"><Eye :size="14" /> Evaluator preview</button></div>
          <ChecklistEditor v-show="mode === 'edit'" :key="checklistId" ref="editor" v-model:sections="sections" v-model:criteria="criteria" :issues="issues" :readonly="saveMutation.isPending.value" /><ChecklistPreview v-if="mode === 'preview'" :sections="sections" :criteria="criteria" />
        </div>
      </div>
      <footer class="sticky bottom-2 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur" aria-label="Save checklist">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-live="polite"><span class="font-semibold" :class="dirty ? 'text-amber-800' : 'text-muted'">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span><span class="text-muted">{{ totalWeight }} / 100 points</span><button v-if="issues.length" type="button" class="font-semibold text-amber-800 underline" @click="showValidation">{{ issues.length }} validation issue{{ issues.length === 1 ? '' : 's' }}</button></div>
        <div class="ml-auto flex gap-2"><button type="button" class="button-secondary !min-h-9 !rounded-md" :disabled="saveMutation.isPending.value" @click="router.push('/checklists')">Cancel</button><button type="button" class="button-primary !min-h-9 !rounded-md" :disabled="saveMutation.isPending.value || !dirty || issues.length > 0" :title="issues.length ? 'Resolve validation issues before saving' : !dirty ? 'No unsaved changes' : 'Save a new checklist version'" @click="!saveMutation.isPending.value && saveMutation.mutate()"><LoaderCircle v-if="saveMutation.isPending.value" :size="16" class="animate-spin" /><Save v-else :size="16" />{{ saveMutation.isPending.value ? 'Saving…' : 'Save changes' }}</button></div>
      </footer>
      <ConfirmDialog v-if="confirmLeave" title="Discard unsaved changes?" confirm-label="Discard changes" cancel-label="Stay" danger @confirm="finishNavigation(true)" @cancel="finishNavigation(false)"><p>Your checklist draft has unsaved changes. Discard the draft and leave this editor?</p></ConfirmDialog>
    </template>
    <div v-else class="rounded-lg border border-line bg-white p-5 text-sm"><h1 class="font-bold">No checklist version available</h1><RouterLink to="/checklists" class="mt-2 inline-block text-muted underline">Back to checklists</RouterLink></div>
  </section>
</template>
