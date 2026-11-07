<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ArrowLeft, Eye, Pencil, Save } from "lucide-vue-next";
import ActivateVersionDialog from "../../components/ActivateVersionDialog/ActivateVersionDialog.vue";
import ChecklistEditor from "../../components/ChecklistEditor/ChecklistEditor.vue";
import ChecklistPreview from "../../components/ChecklistPreview/ChecklistPreview.vue";
import ChecklistViewer from "../../components/ChecklistViewer/ChecklistViewer.vue";
import ChecklistVersionHistory from "../../components/ChecklistVersionHistory/ChecklistVersionHistory.vue";
import WeightSummary from "../../components/WeightSummary/WeightSummary.vue";
import { activateChecklistVersion, checklistKeys, getChecklist, getChecklistVersion, listChecklistVersions, saveChecklistVersion } from "../../api/checklists";
import type { ChecklistCriterion, ChecklistSection, ChecklistVersion } from "../../shared/types/checklist";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const checklistId = computed(() => String(route.params.id));
const routeVersionId = computed(() => route.params.versionId ? String(route.params.versionId) : null);
const readonly = computed(() => Boolean(routeVersionId.value));
const detailQuery = useQuery({ queryKey: computed(() => checklistKeys.detail(checklistId.value)), queryFn: ({ signal }) => getChecklist(checklistId.value, signal) });
const versionsQuery = useQuery({ queryKey: computed(() => checklistKeys.versions(checklistId.value)), queryFn: ({ signal }) => listChecklistVersions(checklistId.value, signal) });
const requestedEditSource = computed(() => typeof route.query.from === "string" ? route.query.from : null);
const selectedVersionId = computed(() => routeVersionId.value ?? requestedEditSource.value ?? detailQuery.data.value?.active_version_id ?? "");
const versionQuery = useQuery({
  queryKey: computed(() => checklistKeys.version(checklistId.value, selectedVersionId.value)),
  queryFn: ({ signal }) => getChecklistVersion(checklistId.value, selectedVersionId.value, signal),
  enabled: computed(() => Boolean(selectedVersionId.value))
});

const name = ref("");
const description = ref("");
const sections = ref<ChecklistSection[]>([]);
const criteria = ref<ChecklistCriterion[]>([]);
const baseVersionId = ref("");
const initializedVersionId = ref("");
const snapshot = ref("");
const mode = ref<"edit" | "preview">("edit");
const message = ref("");
const localError = ref("");
const copySections = (items: ChecklistSection[]) => items.map((item) => ({ id: item.id, display_order: item.display_order, name: item.name }));
const copyCriteria = (items: ChecklistCriterion[]) => items.map((item) => ({ ...item, numeric_scale: item.numeric_scale.map((option) => ({ ...option })) }));
const serialize = () => JSON.stringify({ name: name.value, description: description.value, sections: sections.value, criteria: criteria.value });

watch([() => detailQuery.data.value, () => versionQuery.data.value], ([detail, version]) => {
  if (!detail || !version || initializedVersionId.value === version.id) return;
  name.value = detail.name;
  description.value = detail.description;
  sections.value = copySections(version.sections);
  criteria.value = copyCriteria(version.criteria);
  baseVersionId.value = version.id;
  initializedVersionId.value = version.id;
  snapshot.value = serialize();
  mode.value = "edit";
}, { immediate: true });

const dirty = computed(() => !readonly.value && Boolean(snapshot.value) && serialize() !== snapshot.value);
const enabledCriteria = computed(() => criteria.value.filter((criterion) => criterion.enabled));
const scoringCriteria = computed(() => enabledCriteria.value.filter((criterion) => criterion.answer_type !== "flag" && criterion.weight > 0));
const totalWeight = computed(() => scoringCriteria.value.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0));
const naCount = computed(() => enabledCriteria.value.filter((criterion) => criterion.na_enabled).length);
const basicValidationError = () => {
  if (!name.value.trim()) return "Checklist name is required.";
  if (totalWeight.value !== 100) return `Total configured scoring weight must be 100; received ${totalWeight.value}.`;
  if (sections.value.some((item) => !item.name.trim())) return "Every section needs a name.";
  if (criteria.value.some((item) => !item.display_name.trim())) return "Every criterion needs a name.";
  if (criteria.value.some((item) => item.na_enabled && !item.na_rule.trim())) return "Every N/A-enabled criterion needs an applicability rule.";
  return "";
};

const saveMutation = useMutation({
  mutationFn: () => saveChecklistVersion(checklistId.value, { name: name.value, description: description.value, created_from_version_id: baseVersionId.value, sections: sections.value, criteria: criteria.value }),
  onSuccess: async (version) => {
    const sourceNumber = versionQuery.data.value?.version_number;
    baseVersionId.value = version.id;
    initializedVersionId.value = version.id;
    snapshot.value = serialize();
    queryClient.setQueryData(checklistKeys.version(checklistId.value, version.id), version);
    message.value = `Version ${version.version_number} was created from version ${sourceNumber}. The source version remains unchanged.`;
    localError.value = "";
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: checklistKeys.all }),
      queryClient.invalidateQueries({ queryKey: checklistKeys.detail(checklistId.value) }),
      queryClient.invalidateQueries({ queryKey: checklistKeys.versions(checklistId.value) })
    ]);
    await router.replace({ name: "checklist-edit", params: { id: checklistId.value }, query: { from: version.id } });
  },
  onError: (error) => { localError.value = error.message; }
});
const save = () => { const error = basicValidationError(); if (error) { localError.value = error; return; } saveMutation.mutate(); };

const pendingActivation = ref<ChecklistVersion | null>(null);
const activateMutation = useMutation({
  mutationFn: (version: ChecklistVersion) => activateChecklistVersion(checklistId.value, { version_id: version.id, expected_active_version_id: detailQuery.data.value?.active_version_id ?? null }),
  onSuccess: async (_, version) => { pendingActivation.value = null; message.value = `Version ${version.version_number} is now active.`; await Promise.all([queryClient.invalidateQueries({ queryKey: checklistKeys.all }), queryClient.invalidateQueries({ queryKey: checklistKeys.detail(checklistId.value) }), queryClient.invalidateQueries({ queryKey: checklistKeys.versions(checklistId.value) })]); },
  onError: (error) => { pendingActivation.value = null; localError.value = error.message; }
});

const beforeUnload = (event: BeforeUnloadEvent) => { if (!dirty.value) return; event.preventDefault(); event.returnValue = ""; };
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
onBeforeRouteLeave(() => !dirty.value || window.confirm("You have unsaved checklist changes. Leave without saving?"));
</script>

<template>
  <section>
    <div v-if="detailQuery.isPending.value || (selectedVersionId && versionQuery.isPending.value)" class="h-96 animate-pulse rounded-3xl bg-white" />
    <div v-else-if="detailQuery.isError.value || versionQuery.isError.value" class="rounded-2xl border border-primary/20 bg-primary-soft p-5 text-primary">{{ detailQuery.error.value?.message ?? versionQuery.error.value?.message }}</div>
    <template v-else-if="versionQuery.data.value">
      <header class="mb-6">
        <RouterLink to="/checklists" class="mb-4 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft :size="17" /> Back to checklists</RouterLink>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">Version {{ versionQuery.data.value.version_number }}</span><span v-if="versionQuery.data.value.id === detailQuery.data.value?.active_version_id" class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Active</span><span v-if="dirty" class="text-xs font-semibold text-amber-600">Unsaved changes</span></div>
            <h1 class="mt-3 text-3xl font-black tracking-tight">{{ readonly ? name : 'Edit checklist' }}</h1>
            <p class="mt-2 text-sm text-muted">{{ readonly ? `Stored configuration for version ${versionQuery.data.value.version_number}.` : `Creating a new immutable version from version ${versionQuery.data.value.version_number}.` }}</p>
          </div>
          <RouterLink v-if="readonly" :to="{ name: 'checklist-edit', params: { id: checklistId }, query: { from: versionQuery.data.value.id } }" class="button-primary"><Pencil :size="17" /> Edit from version {{ versionQuery.data.value.version_number }}</RouterLink>
          <button v-else type="button" class="button-primary" :disabled="saveMutation.isPending.value || !dirty" @click="save"><Save :size="18" />{{ saveMutation.isPending.value ? 'Saving…' : 'Save as new version' }}</button>
        </div>
      </header>

      <div class="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-4">
        <div><span class="block text-xs font-bold uppercase text-muted">Criteria</span><strong class="mt-1 block text-xl" data-testid="criteria-count">{{ enabledCriteria.length }}</strong></div>
        <div><span class="block text-xs font-bold uppercase text-muted">Scoring criteria</span><strong class="mt-1 block text-xl">{{ scoringCriteria.length }}</strong></div>
        <div><span class="block text-xs font-bold uppercase text-muted">Total weight</span><strong class="mt-1 block text-xl" data-testid="total-weight">{{ totalWeight }} / 100</strong></div>
        <div><span class="block text-xs font-bold uppercase text-muted">N/A enabled</span><strong class="mt-1 block text-xl">{{ naCount }}</strong></div>
      </div>

      <div v-if="message" class="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{{ message }}</div>
      <div v-if="localError" class="mb-5 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">{{ localError }}</div>

      <div v-if="readonly" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ChecklistViewer :sections="sections" :criteria="criteria" />
        <ChecklistVersionHistory v-if="versionsQuery.data.value" class="lg:sticky lg:top-24 lg:self-start" :versions="versionsQuery.data.value" :active-version-id="detailQuery.data.value?.active_version_id ?? null" :selected-version-id="selectedVersionId" :activating="activateMutation.isPending.value" @activate="pendingActivation = $event" />
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div class="min-w-0 space-y-5">
          <div class="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">Source: version {{ versionQuery.data.value.version_number }}. Saving creates a separate version; version {{ versionQuery.data.value.version_number }} will not be changed.</div>
          <div class="rounded-2xl border border-line bg-white p-5 shadow-sm"><div class="grid gap-4"><label class="label">Checklist name<input v-model="name" class="field mt-1.5" /></label><label class="label">Description<textarea v-model="description" class="field mt-1.5 min-h-20 resize-y" /></label></div></div>
          <div class="flex rounded-xl bg-surface-strong p-1 sm:w-fit"><button type="button" class="tab-button" :class="{ 'tab-button-active': mode === 'edit' }" @click="mode = 'edit'"><Pencil :size="16" /> Edit configuration</button><button type="button" class="tab-button" :class="{ 'tab-button-active': mode === 'preview' }" @click="mode = 'preview'"><Eye :size="16" /> Evaluator preview</button></div>
          <ChecklistEditor v-if="mode === 'edit'" v-model:sections="sections" v-model:criteria="criteria" />
          <ChecklistPreview v-else :sections="sections" :criteria="criteria" />
        </div>
        <div class="space-y-5 lg:sticky lg:top-24 lg:self-start"><WeightSummary :criteria="criteria" :sections="sections" /><ChecklistVersionHistory v-if="versionsQuery.data.value" :versions="versionsQuery.data.value" :active-version-id="detailQuery.data.value?.active_version_id ?? null" :selected-version-id="selectedVersionId" :activating="activateMutation.isPending.value" @activate="pendingActivation = $event" /></div>
      </div>
    </template>
    <ActivateVersionDialog :open="Boolean(pendingActivation)" :version-number="pendingActivation?.version_number" :pending="activateMutation.isPending.value" @cancel="pendingActivation = null" @confirm="pendingActivation && activateMutation.mutate(pendingActivation)" />
  </section>
</template>
