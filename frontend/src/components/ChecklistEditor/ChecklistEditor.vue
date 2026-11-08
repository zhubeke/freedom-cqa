<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Plus } from "lucide-vue-next";
import { VueDraggable } from "vue-draggable-plus";
import ChecklistSectionComponent from "../ChecklistSection/ChecklistSection.vue";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog.vue";
import { flattenChecklistDraft, groupChecklistDraft, nextCriterionCode, rememberNumericScales, sameChecklistIdentities, type ChecklistSectionDraft } from "../../shared/checklist-draft";
import type { ChecklistValidationIssue } from "../../shared/checklist-validation";
import type { ChecklistCriterion, ChecklistSection, NumericScaleOption } from "../../shared/types/checklist";
const props = withDefaults(defineProps<{ sections: ChecklistSection[]; criteria: ChecklistCriterion[]; readonly?: boolean; issues?: ChecklistValidationIssue[] }>(), { issues: () => [] });
const emit = defineEmits<{ "update:sections": [value: ChecklistSection[]]; "update:criteria": [value: ChecklistCriterion[]] }>();
const board = ref<ChecklistSectionDraft[]>([]);
const dragging = ref(false);
const expanded = ref(new Set<string>());
const collapsedSections = ref(new Set<string>());
const announcement = ref("");
const numericBackups = ref(new Map<string, NumericScaleOption[]>());
const dragError = ref("");
let dragSnapshot: { sections: ChecklistSection[]; criteria: ChecklistCriterion[] } | null = null;
const dragGroup = `checklist-criteria-${crypto.randomUUID()}`;
const animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
watch(() => [props.sections, props.criteria] as const, () => { numericBackups.value = rememberNumericScales(props.criteria, numericBackups.value); if (!dragging.value) board.value = groupChecklistDraft(props.sections, props.criteria); }, { deep: true, immediate: true });
function commit() { const next = flattenChecklistDraft(board.value); emit("update:sections", next.sections); emit("update:criteria", next.criteria); }
function startDrag() { dragSnapshot = { sections: props.sections.map((item) => ({ ...item })), criteria: props.criteria.map((item) => ({ ...item })) }; dragging.value = true; dragError.value = ""; }
async function finishDrag() {
  // Sortable emits the target add and source remove separately; publish only their settled result.
  await nextTick();
  const next = flattenChecklistDraft(board.value);
  if (dragSnapshot && !sameChecklistIdentities(dragSnapshot, next)) {
    board.value = groupChecklistDraft(dragSnapshot.sections, dragSnapshot.criteria);
    dragError.value = "This move could not be applied safely. Your draft was preserved. Try again or use the actions menu to move it.";
    announcement.value = dragError.value;
  } else { commit(); announcement.value = "New order applied to draft. Save changes to keep this order."; }
  dragSnapshot = null; dragging.value = false;
}
function toggleCriterion(id: string) { const next = new Set(expanded.value); if (next.has(id)) next.delete(id); else next.add(id); expanded.value = next; }
function toggleSection(id: string) { const next = new Set(collapsedSections.value); if (next.has(id)) next.delete(id); else next.add(id); collapsedSections.value = next; }
function expandAll() { expanded.value = new Set(props.criteria.map((criterion) => criterion.id)); collapsedSections.value = new Set(); }
function collapseAll() { expanded.value = new Set(); collapsedSections.value = new Set(); }
function updateCriterion(value: ChecklistCriterion) { for (const item of board.value) item.criteria = item.criteria.map((criterion) => criterion.id === value.id ? value : criterion); commit(); }
function updateSection(value: ChecklistSection) { const item = board.value.find((entry) => entry.section.id === value.id); if (item) item.section = value; commit(); }
function addSection() { board.value.push({ section: { id: crypto.randomUUID(), display_order: board.value.length + 1, name: "New section" }, criteria: [] }); commit(); }
async function addCriterion(sectionId: string) {
  const section = board.value.find((entry) => entry.section.id === sectionId); if (!section) return;
  const id = crypto.randomUUID(); section.criteria.push({ id, code: nextCriterionCode(props.criteria), display_order: props.criteria.length + 1, section_id: sectionId, source_name: "", display_name: "New criterion", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 0, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true });
  expanded.value = new Set([...expanded.value, id]); collapsedSections.value.delete(sectionId); commit(); await nextTick(); document.getElementById(`criterion-${id}-display_name`)?.focus();
}
async function moveSection(id: string, direction: -1 | 1) { const index = board.value.findIndex((entry) => entry.section.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= board.value.length) return; const [item] = board.value.splice(index, 1); board.value.splice(target, 0, item!); commit(); announcement.value = `${item!.section.name} moved to section ${target + 1}.`; await nextTick(); document.getElementById(`section-${id}`)?.querySelector<HTMLButtonElement>(".section-drag-handle")?.focus(); }
async function moveCriterion(id: string, direction: -1 | 1) { const section = board.value.find((entry) => entry.criteria.some((criterion) => criterion.id === id)); if (!section) return; const index = section.criteria.findIndex((criterion) => criterion.id === id); const target = index + direction; if (target < 0 || target >= section.criteria.length) return; const [criterion] = section.criteria.splice(index, 1); section.criteria.splice(target, 0, criterion!); commit(); announcement.value = `Criterion ${criterion!.code} moved to position ${target + 1}.`; await nextTick(); document.getElementById(`criterion-${id}`)?.querySelector<HTMLButtonElement>(".criterion-drag-handle")?.focus(); }
const pendingDelete = ref<{ type: "section" | "criterion"; id: string; name: string } | null>(null);
function removePending() { const pending = pendingDelete.value; if (!pending) return; if (pending.type === "section") board.value = board.value.filter((entry) => entry.section.id !== pending.id || entry.criteria.length > 0); else for (const entry of board.value) entry.criteria = entry.criteria.filter((criterion) => criterion.id !== pending.id); commit(); pendingDelete.value = null; }
const movingId = ref<string | null>(null);
const moveTarget = ref("");
const movePosition = ref(1);
const moveTargets = computed(() => board.value.find((entry) => entry.section.id === moveTarget.value)?.criteria.filter((criterion) => criterion.id !== movingId.value) ?? []);
watch(moveTarget, () => { movePosition.value = moveTargets.value.length + 1; });
function openMove(criterion: ChecklistCriterion) { moveTarget.value = criterion.section_id; movingId.value = criterion.id; movePosition.value = (board.value.find((entry) => entry.section.id === criterion.section_id)?.criteria.findIndex((item) => item.id === criterion.id) ?? 0) + 1; }
async function applyMove() {
  const criterion = props.criteria.find((item) => item.id === movingId.value); const target = board.value.find((entry) => entry.section.id === moveTarget.value); if (!criterion || !target) return;
  for (const entry of board.value) entry.criteria = entry.criteria.filter((item) => item.id !== criterion.id);
  const position = Math.max(0, Math.min(target.criteria.length, Number(movePosition.value) - 1)); target.criteria.splice(position, 0, { ...criterion, section_id: target.section.id }); collapsedSections.value.delete(target.section.id); commit(); movingId.value = null; announcement.value = `Criterion ${criterion.code} moved to ${target.section.name}.`; await nextTick(); document.getElementById(`criterion-${criterion.id}-display_name`)?.focus();
}
function actionCriterion(id: string, action: string) {
  const criterion = props.criteria.find((item) => item.id === id); if (!criterion) return;
  if (action === "toggle") updateCriterion({ ...criterion, enabled: !criterion.enabled });
  else if (action === "delete") pendingDelete.value = { type: "criterion", id, name: criterion.display_name };
  else if (action === "move") openMove(criterion);
  else if (action === "up" || action === "down") void moveCriterion(id, action === "up" ? -1 : 1);
  else if (action === "duplicate") { const entry = board.value.find((item) => item.section.id === criterion.section_id)!; const index = entry.criteria.findIndex((item) => item.id === id); const copy = { ...criterion, id: crypto.randomUUID(), code: nextCriterionCode(props.criteria), display_name: `${criterion.display_name} (copy)`, numeric_scale: criterion.numeric_scale.map((item) => ({ ...item })) }; entry.criteria.splice(index + 1, 0, copy); expanded.value = new Set([...expanded.value, copy.id]); commit(); }
}
function actionSection(section: ChecklistSection, action: string) { if (action === "up" || action === "down") void moveSection(section.id, action === "up" ? -1 : 1); else if (action === "add") void addCriterion(section.id); else if (action === "delete") pendingDelete.value = { type: "section", id: section.id, name: section.name }; }
async function revealIssue(issue: ChecklistValidationIssue) {
  if (issue.sectionId) collapsedSections.value.delete(issue.sectionId);
  if (issue.criterionId) expanded.value = new Set([...expanded.value, issue.criterionId]);
  await nextTick(); const target = issue.criterionId ? document.getElementById(`criterion-${issue.criterionId}-${issue.field}`) ?? document.getElementById(`criterion-${issue.criterionId}`) : issue.sectionId ? document.getElementById(`section-${issue.sectionId}-name`) : null;
  target?.scrollIntoView({ block: "center", behavior: animation ? "smooth" : "instant" }); target?.focus({ preventScroll: true });
}
defineExpose({ revealIssue });
</script>
<template>
  <div id="checklist-sections" class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-sm font-bold">Sections & criteria</h2><div class="flex gap-3 text-xs font-semibold text-muted"><button type="button" class="min-h-8 hover:text-ink hover:underline" @click="expandAll">Expand all</button><button type="button" class="min-h-8 hover:text-ink hover:underline" @click="collapseAll">Collapse all</button></div></div>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <p v-if="dragError" class="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" role="alert">{{ dragError }}</p>
    <VueDraggable v-model="board" class="space-y-3" handle=".section-drag-handle" draggable=".checklist-section" :animation="animation" :disabled="readonly" ghost-class="checklist-drop-ghost" chosen-class="checklist-drag-chosen" @start="startDrag" @end="finishDrag">
      <ChecklistSectionComponent v-for="(entry, index) in board" :key="entry.section.id" :section="entry.section" :criteria="entry.criteria" :index="index" :total="board.length" :readonly="readonly" :expanded-criteria="expanded" :collapsed="collapsedSections.has(entry.section.id)" :drag-group="dragGroup" :animation="animation" :issues="issues" :numeric-backups="numericBackups" @update-section="updateSection" @toggle-section="toggleSection(entry.section.id)" @action-section="actionSection(entry.section, $event)" @move-section="moveSection(entry.section.id, $event)" @add-criterion="addCriterion(entry.section.id)" @update-criterion="updateCriterion" @toggle-criterion="toggleCriterion" @action-criterion="actionCriterion" @move-criterion="moveCriterion" @drag-criteria="entry.criteria = $event" @drag-start="startDrag" @drag-end="finishDrag" />
    </VueDraggable>
    <button v-if="!readonly" type="button" class="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-white text-xs font-semibold text-muted hover:border-slate-400 hover:text-ink" @click="addSection"><Plus :size="16" /> Add section</button>
    <p v-if="!readonly" class="text-xs leading-5 text-muted">Use drag handles to arrange sections and criteria. Use Alt + Up/Down on a handle, or its actions menu, to reorder with a keyboard.</p>
    <ConfirmDialog v-if="pendingDelete" :title="`Delete ${pendingDelete.type}?`" confirm-label="Delete" danger @confirm="removePending" @cancel="pendingDelete = null"><p class="text-sm leading-6 text-muted">Remove “{{ pendingDelete.name }}” from this draft? Historical checklist versions remain available.</p></ConfirmDialog>
    <ConfirmDialog v-if="movingId" title="Move criterion" confirm-label="Move criterion" @confirm="applyMove" @cancel="movingId = null"><div class="space-y-3"><label class="label">Section<select aria-label="Section" v-model="moveTarget" class="field mt-1"><option v-for="entry in board" :key="entry.section.id" :value="entry.section.id">{{ entry.section.name }}</option></select></label><label class="label">Position<select aria-label="Position" v-model="movePosition" class="field mt-1"><option v-for="position in moveTargets.length + 1" :key="position" :value="position">{{ position }}{{ position === moveTargets.length + 1 ? ' (last)' : '' }}</option></select></label></div></ConfirmDialog>
  </div>
</template>
<style scoped>
:deep(.checklist-drop-ghost) { opacity: .4; background: #e2e8f0; outline: 2px dashed #64748b; outline-offset: -2px; }
:deep(.checklist-drag-chosen) { box-shadow: 0 3px 12px #0f172a12; }
</style>
