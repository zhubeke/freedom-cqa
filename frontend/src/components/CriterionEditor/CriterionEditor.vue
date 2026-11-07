<script setup lang="ts">
import { ArrowDown, ArrowUp, Trash2 } from "lucide-vue-next";
import NumericScaleEditor from "../NumericScaleEditor/NumericScaleEditor.vue";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

const props = defineProps<{ criterion: ChecklistCriterion; sections: ChecklistSection[]; index: number; total: number; readonly?: boolean }>();
const emit = defineEmits<{ update: [value: ChecklistCriterion]; remove: []; move: [direction: -1 | 1] }>();
const set = <K extends keyof ChecklistCriterion>(key: K, value: ChecklistCriterion[K]) => emit("update", { ...props.criterion, [key]: value });
const changeType = (value: ChecklistCriterion["answer_type"]) => emit("update", { ...props.criterion, answer_type: value, weight: value === "flag" ? 0 : props.criterion.weight, numeric_scale: value === "numeric" ? (props.criterion.numeric_scale.length ? props.criterion.numeric_scale : [{ value: 0, description: "Not met" }, { value: 10, description: "Fully met" }]) : [] });
</script>

<template>
  <article class="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5" :class="{ 'opacity-70': !criterion.enabled }">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2"><span class="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-extrabold text-primary">{{ criterion.code }}</span><span class="text-xs font-medium text-muted">{{ criterion.source_name || 'New criterion' }}</span></div>
      <div v-if="!readonly" class="flex items-center gap-1">
        <button type="button" class="icon-button" :disabled="index === 0" aria-label="Move criterion up" @click="emit('move', -1)"><ArrowUp :size="17" /></button>
        <button type="button" class="icon-button" :disabled="index === total - 1" aria-label="Move criterion down" @click="emit('move', 1)"><ArrowDown :size="17" /></button>
        <button type="button" class="icon-button text-primary" aria-label="Remove criterion" @click="emit('remove')"><Trash2 :size="17" /></button>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="label sm:col-span-2">Criterion name<input :value="criterion.display_name" :disabled="readonly" class="field mt-1.5" @input="set('display_name', ($event.target as HTMLInputElement).value)" /></label>
      <label class="label sm:col-span-2">Description<textarea :value="criterion.description" :disabled="readonly" class="field mt-1.5 min-h-20 resize-y" @input="set('description', ($event.target as HTMLTextAreaElement).value)" /></label>
      <label class="label sm:col-span-2">Evaluation instruction<textarea :value="criterion.evaluation_instructions" :disabled="readonly" class="field mt-1.5 min-h-20 resize-y" @input="set('evaluation_instructions', ($event.target as HTMLTextAreaElement).value)" /></label>
      <label class="label">Answer type<select :value="criterion.answer_type" :disabled="readonly" class="field mt-1.5" @change="changeType(($event.target as HTMLSelectElement).value as ChecklistCriterion['answer_type'])"><option value="boolean">Yes / No</option><option value="numeric">Numeric scale</option><option value="flag">Violation flag</option></select></label>
      <label class="label">Weight<input :value="criterion.weight" type="number" min="0" step="1" :disabled="readonly || criterion.answer_type === 'flag'" class="field mt-1.5" @input="set('weight', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="label sm:col-span-2">Section<select :value="criterion.section_id" :disabled="readonly" class="field mt-1.5" @change="set('section_id', ($event.target as HTMLSelectElement).value)"><option v-for="section in sections" :key="section.id" :value="section.id">{{ section.name }}</option></select></label>
    </div>
    <NumericScaleEditor v-if="criterion.answer_type === 'numeric'" class="mt-4" :model-value="criterion.numeric_scale" :readonly="readonly" @update:model-value="set('numeric_scale', $event)" />
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <label class="toggle-row"><input :checked="criterion.enabled" type="checkbox" :disabled="readonly" @change="set('enabled', ($event.target as HTMLInputElement).checked)" /><span>Enabled</span></label>
      <label class="toggle-row"><input :checked="criterion.na_enabled" type="checkbox" :disabled="readonly" @change="set('na_enabled', ($event.target as HTMLInputElement).checked)" /><span>Allow N/A</span></label>
      <label v-if="criterion.na_enabled" class="label sm:col-span-2">N/A applicability rule<textarea :value="criterion.na_rule" :disabled="readonly" class="field mt-1.5 min-h-16 resize-y" @input="set('na_rule', ($event.target as HTMLTextAreaElement).value)" /></label>
    </div>
  </article>
</template>
