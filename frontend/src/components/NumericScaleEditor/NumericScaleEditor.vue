<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import ConversationMenu from "../ConversationMenu/ConversationMenu.vue";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog.vue";
import { ref } from "vue";
import type { NumericScaleOption } from "../../shared/types/checklist";
const props = defineProps<{ modelValue: NumericScaleOption[]; readonly?: boolean; inputId?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: NumericScaleOption[]] }>();
const pendingRemove = ref<number | null>(null);
function update(index: number, field: keyof NumericScaleOption, value: string) { emit("update:modelValue", props.modelValue.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === "value" ? (value.trim() ? Number(value) : Number.NaN) : value } : item)); }
function add() { const maximum = Math.max(0, ...props.modelValue.map((item) => Number.isFinite(item.value) ? item.value : 0)); emit("update:modelValue", [...props.modelValue, { value: maximum + 1, description: "" }]); }
function remove() { emit("update:modelValue", props.modelValue.filter((_, index) => index !== pendingRemove.value)); pendingRemove.value = null; }
</script>
<template>
  <div>
    <div class="mb-2 flex items-center justify-between gap-2"><h4 class="text-xs font-bold uppercase tracking-wide text-muted">Scoring scale</h4><button v-if="!readonly" type="button" class="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-slate-700 hover:underline" @click="add"><Plus :size="14" /> Add score</button></div>
    <div class="grid grid-cols-[4.5rem_1fr_2.25rem] gap-2 border-b border-line pb-2 text-xs font-semibold text-muted"><span>Score</span><span>Description</span><span class="sr-only">Actions</span></div>
    <div v-for="(option, index) in modelValue" :key="index" class="grid grid-cols-[4.5rem_1fr_2.25rem] items-start gap-2 border-b border-line/70 py-1.5">
      <input :id="index === 0 ? inputId : undefined" :value="option.value" type="number" min="0" :disabled="readonly" class="field !rounded-md !px-2 !py-2 font-bold" :aria-label="`Score value ${index + 1}`" :aria-invalid="modelValue.some((item, itemIndex) => itemIndex !== index && item.value === option.value) || undefined" @input="update(index, 'value', ($event.target as HTMLInputElement).value)" />
      <textarea :value="option.description" rows="1" :disabled="readonly" class="field min-h-9 resize-y !rounded-md !px-2 !py-2" placeholder="What this score means" :aria-label="`Description for score ${option.value}`" @input="update(index, 'description', ($event.target as HTMLTextAreaElement).value)" />
      <ConversationMenu v-if="!readonly" :label="`Actions for score ${option.value}`" :items="[{ id: 'remove', label: 'Remove score', destructive: true }]" @select="pendingRemove = index" />
    </div>
    <p class="mt-2 text-xs leading-5 text-muted">Values must be unique and ascending, from 0 to a positive maximum. The raw maximum can differ from the criterion weight.</p>
    <ConfirmDialog v-if="pendingRemove !== null" title="Remove score?" confirm-label="Remove score" danger @confirm="remove" @cancel="pendingRemove = null"><p class="text-sm leading-6 text-muted">Remove score {{ modelValue[pendingRemove]?.value }} and its description from this draft?</p></ConfirmDialog>
  </div>
</template>
