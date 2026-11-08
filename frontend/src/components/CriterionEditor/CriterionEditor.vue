<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, GripVertical } from "lucide-vue-next";
import NumericScaleEditor from "../NumericScaleEditor/NumericScaleEditor.vue";
import ConversationMenu from "../ConversationMenu/ConversationMenu.vue";
import ChecklistSwitch from "../ChecklistSwitch/ChecklistSwitch.vue";
import type { ChecklistCriterion, NumericScaleOption } from "../../shared/types/checklist";
import type { ChecklistValidationIssue } from "../../shared/checklist-validation";
const props = defineProps<{ criterion: ChecklistCriterion; index: number; total: number; expanded: boolean; readonly?: boolean; issues?: ChecklistValidationIssue[]; numericBackup?: NumericScaleOption[] }>();
const emit = defineEmits<{ update: [value: ChecklistCriterion]; toggle: []; action: [value: string]; move: [direction: -1 | 1] }>();
const set = <K extends keyof ChecklistCriterion>(key: K, value: ChecklistCriterion[K]) => emit("update", { ...props.criterion, [key]: value });
function changeType(value: ChecklistCriterion["answer_type"]) {
  emit("update", { ...props.criterion, answer_type: value, weight: value === "flag" ? 0 : props.criterion.weight, numeric_scale: value === "numeric" ? (props.numericBackup?.length ? props.numericBackup.map((item) => ({ ...item })) : [{ value: 0, description: "Not met" }, { value: 10, description: "Fully met" }]) : [] });
}
const answerSummary = computed(() => props.criterion.answer_type === "numeric" ? `${props.criterion.numeric_scale[0]?.value ?? 0}–${props.criterion.numeric_scale.at(-1)?.value ?? 0}` : props.criterion.answer_type === "flag" ? "Violation flag" : "Yes / No");
const fieldId = (field: string) => `criterion-${props.criterion.id}-${field}`;
const invalid = (field: string) => props.issues?.some((issue) => issue.field === field) || undefined;
const menuItems = computed(() => [{ id: "duplicate", label: "Duplicate" }, { id: "move", label: "Move to section / position" }, { id: "up", label: "Move earlier", disabled: props.index === 0 }, { id: "down", label: "Move later", disabled: props.index === props.total - 1 }, { id: "toggle", label: props.criterion.enabled ? "Disable" : "Enable" }, { id: "delete", label: "Delete", destructive: true }]);
</script>
<template>
  <article :id="`criterion-${criterion.id}`" class="criterion-item scroll-mt-28 border-b border-line last:border-b-0" :class="{ 'bg-surface/70 text-muted': !criterion.enabled }">
    <div class="flex min-h-14 cursor-pointer items-center gap-1.5 px-2 sm:gap-2 sm:px-3" @click="emit('toggle')">
      <button v-if="!readonly" type="button" class="criterion-drag-handle icon-button !size-8 cursor-grab active:cursor-grabbing" :aria-label="`Reorder criterion ${criterion.code}. Alt plus Up or Down moves within this section`" title="Drag to move; Alt + Up/Down to reorder" @click.stop @keydown.alt.up.prevent.stop="emit('move', -1)" @keydown.alt.down.prevent.stop="emit('move', 1)"><GripVertical :size="16" /></button>
      <span class="shrink-0 font-mono text-xs font-bold text-muted">{{ criterion.code }}</span>
      <input :id="fieldId('display_name')" :value="criterion.display_name" :title="criterion.display_name" :disabled="readonly" :aria-label="`Criterion ${criterion.code} name`" :aria-invalid="invalid('display_name')" class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1.5 text-sm font-semibold outline-none hover:border-line focus:border-slate-400 disabled:opacity-100" placeholder="Criterion name" @click.stop @keydown.stop @input="set('display_name', ($event.target as HTMLInputElement).value)" />
      <span class="hidden shrink-0 text-xs text-muted sm:block">{{ answerSummary }}<span class="mx-1.5">·</span>{{ criterion.weight }} pts</span>
      <span class="hidden shrink-0 text-[11px] font-medium md:block" :class="criterion.enabled ? 'text-emerald-700' : 'text-muted'">{{ criterion.enabled ? 'Enabled' : 'Disabled' }}</span>
      <span v-if="issues?.length" class="size-2 shrink-0 rounded-full bg-amber-500" :title="`${issues.length} validation issue(s)`"><span class="sr-only">Has validation errors</span></span>
      <span v-if="!readonly" @click.stop><ConversationMenu :label="`Actions for criterion ${criterion.code}`" :items="menuItems" @select="emit('action', $event)" /></span>
      <button type="button" class="icon-button !size-8" :aria-expanded="expanded" :aria-controls="`criterion-fields-${criterion.id}`" :aria-label="`${expanded ? 'Collapse' : 'Expand'} criterion ${criterion.code}`" @click.stop="emit('toggle')"><ChevronDown :size="17" class="transition-transform motion-reduce:transition-none" :class="{ 'rotate-180': expanded }" /></button>
    </div>
    <div class="flex cursor-pointer flex-wrap gap-x-2 gap-y-1 px-4 pb-2 text-[11px] text-muted sm:hidden" @click="emit('toggle')"><span>{{ answerSummary }} · {{ criterion.weight }} pts</span><span :class="criterion.enabled ? 'text-emerald-700' : 'text-muted'">{{ criterion.enabled ? 'Enabled' : 'Disabled' }}</span></div>
    <div v-show="expanded" :id="`criterion-fields-${criterion.id}`" class="border-t border-line/60 px-4 pb-4 pt-3 sm:px-5">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="label sm:col-span-2">Description<textarea :id="fieldId('description')" :value="criterion.description" :disabled="readonly" class="field mt-1 min-h-16 resize-y !rounded-md !py-2" @input="set('description', ($event.target as HTMLTextAreaElement).value)" /></label>
        <label class="label sm:col-span-2">Evaluation instruction<textarea :id="fieldId('evaluation_instructions')" :value="criterion.evaluation_instructions" :disabled="readonly" class="field mt-1 min-h-20 resize-y !rounded-md !py-2" @input="set('evaluation_instructions', ($event.target as HTMLTextAreaElement).value)" /></label>
        <label class="label">Answer type<select aria-label="Answer type" :id="fieldId('answer_type')" :value="criterion.answer_type" :disabled="readonly" class="field mt-1 !rounded-md !py-2" @change="changeType(($event.target as HTMLSelectElement).value as ChecklistCriterion['answer_type'])"><option value="boolean">Yes / No</option><option value="numeric">Numeric scale</option><option value="flag">Violation flag</option></select></label>
        <label class="label">Weight<input :id="fieldId('weight')" :value="criterion.weight" type="number" min="0" step="any" :disabled="readonly || criterion.answer_type === 'flag'" :aria-invalid="invalid('weight')" class="field mt-1 !rounded-md !py-2" @input="set('weight', ($event.target as HTMLInputElement).value.trim() ? Number(($event.target as HTMLInputElement).value) : Number.NaN)" /></label>
      </div>
      <NumericScaleEditor v-if="criterion.answer_type === 'numeric'" class="mt-4" :input-id="fieldId('numeric_scale')" :model-value="criterion.numeric_scale" :readonly="readonly" @update:model-value="set('numeric_scale', $event)" />
      <div class="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3"><ChecklistSwitch :model-value="criterion.enabled" label="Enabled" :disabled="readonly" @update:model-value="set('enabled', $event)" /><ChecklistSwitch :model-value="criterion.na_enabled" label="Allow N/A" :disabled="readonly" @update:model-value="set('na_enabled', $event)" /></div>
      <label v-if="criterion.na_enabled" class="label mt-3">N/A applicability rule<textarea :id="fieldId('na_rule')" :value="criterion.na_rule" :disabled="readonly" :aria-invalid="invalid('na_rule')" class="field mt-1 min-h-16 resize-y !rounded-md !py-2" @input="set('na_rule', ($event.target as HTMLTextAreaElement).value)" /></label>
      <ul v-if="issues?.length" class="mt-3 space-y-1 text-xs leading-5 text-amber-800" role="status"><li v-for="issue in issues" :key="issue.id">{{ issue.message }}</li></ul>
    </div>
  </article>
</template>
