<script setup lang="ts">
import { ArrowDown, ArrowUp, Trash2 } from "lucide-vue-next";
import AddCriterionButton from "../AddCriterionButton/AddCriterionButton.vue";
import CriterionEditor from "../CriterionEditor/CriterionEditor.vue";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

const props = defineProps<{ section: ChecklistSection; sections: ChecklistSection[]; criteria: ChecklistCriterion[]; index: number; total: number; readonly?: boolean }>();
const emit = defineEmits<{ updateSection: [value: ChecklistSection]; removeSection: []; moveSection: [direction: -1 | 1]; addCriterion: []; updateCriterion: [value: ChecklistCriterion]; removeCriterion: [id: string]; moveCriterion: [id: string, direction: -1 | 1] }>();
</script>
<template>
  <section class="rounded-3xl border border-line bg-surface/70 p-3 sm:p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
      <div class="min-w-0 flex-1"><span class="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-primary">Section {{ index + 1 }}</span><input :value="section.name" :disabled="readonly" class="w-full border-0 bg-transparent p-0 text-lg font-extrabold text-ink outline-none disabled:opacity-100" aria-label="Section name" @input="emit('updateSection', { ...section, name: ($event.target as HTMLInputElement).value })" /></div>
      <div v-if="!readonly" class="flex gap-1"><button type="button" class="icon-button" :disabled="index === 0" aria-label="Move section up" @click="emit('moveSection', -1)"><ArrowUp :size="18" /></button><button type="button" class="icon-button" :disabled="index === total - 1" aria-label="Move section down" @click="emit('moveSection', 1)"><ArrowDown :size="18" /></button><button type="button" class="icon-button text-primary" :disabled="criteria.length > 0" :title="criteria.length ? 'Remove its criteria first' : 'Remove section'" aria-label="Remove section" @click="emit('removeSection')"><Trash2 :size="18" /></button></div>
    </div>
    <div class="space-y-3"><CriterionEditor v-for="(criterion, criterionIndex) in criteria" :key="criterion.id" :criterion="criterion" :sections="sections" :index="criterionIndex" :total="criteria.length" :readonly="readonly" @update="emit('updateCriterion', $event)" @remove="emit('removeCriterion', criterion.id)" @move="emit('moveCriterion', criterion.id, $event)" /></div>
    <AddCriterionButton v-if="!readonly" class="mt-3 w-full" @click="emit('addCriterion')" />
  </section>
</template>
