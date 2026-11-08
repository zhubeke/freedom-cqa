<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, GripVertical, Plus } from "lucide-vue-next";
import { VueDraggable } from "vue-draggable-plus";
import ConversationMenu from "../ConversationMenu/ConversationMenu.vue";
import CriterionEditor from "../CriterionEditor/CriterionEditor.vue";
import { scoringWeight, type ChecklistValidationIssue } from "../../shared/checklist-validation";
import type { ChecklistCriterion, ChecklistSection, NumericScaleOption } from "../../shared/types/checklist";
const props = defineProps<{ section: ChecklistSection; criteria: ChecklistCriterion[]; index: number; total: number; expandedCriteria: Set<string>; collapsed: boolean; dragGroup: string; animation: number; issues: ChecklistValidationIssue[]; numericBackups: Map<string, NumericScaleOption[]>; readonly?: boolean }>();
const emit = defineEmits<{ updateSection: [value: ChecklistSection]; toggleSection: []; actionSection: [value: string]; moveSection: [direction: -1 | 1]; addCriterion: []; updateCriterion: [value: ChecklistCriterion]; toggleCriterion: [id: string]; actionCriterion: [id: string, value: string]; moveCriterion: [id: string, direction: -1 | 1]; dragCriteria: [value: ChecklistCriterion[]]; dragStart: []; dragEnd: [] }>();
const items = computed(() => [{ id: "up", label: "Move section earlier", disabled: props.index === 0 }, { id: "down", label: "Move section later", disabled: props.index === props.total - 1 }, { id: "add", label: "Add criterion" }, { id: "delete", label: "Delete empty section", destructive: true, disabled: props.criteria.length > 0 }]);
</script>
<template>
  <section :id="`section-${section.id}`" class="checklist-section min-w-0 scroll-mt-28 rounded-lg border border-line bg-white">
    <header class="flex min-h-14 cursor-pointer items-center gap-2 rounded-t-lg bg-surface/70 px-2 sm:px-3" @click="emit('toggleSection')">
      <button v-if="!readonly" type="button" class="section-drag-handle icon-button !size-8 cursor-grab active:cursor-grabbing" :aria-label="`Reorder section ${section.name}. Alt plus Up or Down changes its position`" title="Drag to move; Alt + Up/Down to reorder" @click.stop @keydown.alt.up.prevent.stop="emit('moveSection', -1)" @keydown.alt.down.prevent.stop="emit('moveSection', 1)"><GripVertical :size="17" /></button>
      <input :id="`section-${section.id}-name`" :value="section.name" :disabled="readonly" :aria-label="`Section ${index + 1} name`" class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1.5 text-sm font-bold outline-none hover:border-line focus:border-slate-400 disabled:opacity-100" placeholder="Section name" @click.stop @input="emit('updateSection', { ...section, name: ($event.target as HTMLInputElement).value })" />
      <span class="hidden shrink-0 text-xs text-muted sm:block">{{ criteria.length }} criteria<span class="mx-1.5">·</span>{{ scoringWeight(criteria) }} pts</span>
      <span v-if="!readonly" @click.stop><ConversationMenu :label="`Actions for section ${section.name}`" :items="items" @select="emit('actionSection', $event)" /></span>
      <button type="button" class="icon-button !size-8" :aria-expanded="!collapsed" :aria-controls="`section-criteria-${section.id}`" :aria-label="`${collapsed ? 'Expand' : 'Collapse'} section ${section.name}`" @click.stop="emit('toggleSection')"><ChevronDown :size="17" class="transition-transform motion-reduce:transition-none" :class="{ 'rotate-180': !collapsed }" /></button>
    </header>
    <p class="bg-surface/70 px-4 pb-2 text-[11px] text-muted sm:hidden">{{ criteria.length }} criteria · {{ scoringWeight(criteria) }} enabled points</p>
    <div v-show="!collapsed" :id="`section-criteria-${section.id}`" class="border-t border-line">
      <div class="relative"><VueDraggable :model-value="criteria" :group="dragGroup" :animation="animation" :disabled="readonly" handle=".criterion-drag-handle" draggable=".criterion-item" ghost-class="checklist-drop-ghost" chosen-class="checklist-drag-chosen" class="min-h-12" @update:model-value="emit('dragCriteria', $event)" @start="emit('dragStart')" @end="emit('dragEnd')">
        <CriterionEditor v-for="(criterion, criterionIndex) in criteria" :key="criterion.id" :criterion="criterion" :index="criterionIndex" :total="criteria.length" :expanded="expandedCriteria.has(criterion.id)" :readonly="readonly" :issues="issues.filter((issue) => issue.criterionId === criterion.id)" :numeric-backup="numericBackups.get(criterion.id)" @update="emit('updateCriterion', $event)" @toggle="emit('toggleCriterion', criterion.id)" @action="emit('actionCriterion', criterion.id, $event)" @move="emit('moveCriterion', criterion.id, $event)" />
      </VueDraggable><p v-if="!criteria.length" class="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted">Drag criteria here, or add a criterion.</p></div>
      <button v-if="!readonly" type="button" class="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-dashed border-line text-xs font-semibold text-muted hover:bg-surface hover:text-ink" @click="emit('addCriterion')"><Plus :size="15" /> Add criterion</button>
    </div>
  </section>
</template>
