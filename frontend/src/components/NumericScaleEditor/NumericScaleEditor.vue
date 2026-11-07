<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import type { NumericScaleOption } from "../../shared/types/checklist";

const props = defineProps<{ modelValue: NumericScaleOption[]; readonly?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: NumericScaleOption[]] }>();
const update = (index: number, field: keyof NumericScaleOption, value: string) => {
  const next = props.modelValue.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === "value" ? Number(value) : value } : item);
  emit("update:modelValue", next);
};
const add = () => emit("update:modelValue", [...props.modelValue, { value: 0, description: "" }]);
const remove = (index: number) => emit("update:modelValue", props.modelValue.filter((_, itemIndex) => itemIndex !== index));
</script>

<template>
  <div class="rounded-xl border border-line bg-surface/60 p-3">
    <div class="mb-2 flex items-center justify-between"><span class="text-xs font-bold uppercase tracking-wide text-muted">Numeric scale</span><button v-if="!readonly" type="button" class="inline-flex items-center gap-1 text-xs font-semibold text-primary" @click="add"><Plus :size="14" /> Add value</button></div>
    <div class="space-y-2">
      <div v-for="(option, index) in modelValue" :key="index" class="grid grid-cols-[5rem_1fr_auto] gap-2">
        <input :value="option.value" type="number" :disabled="readonly" class="field" aria-label="Scale value" @input="update(index, 'value', ($event.target as HTMLInputElement).value)" />
        <input :value="option.description" :disabled="readonly" class="field" placeholder="What this score means" aria-label="Scale description" @input="update(index, 'description', ($event.target as HTMLInputElement).value)" />
        <button v-if="!readonly" type="button" class="icon-button text-muted hover:text-primary" aria-label="Remove scale value" @click="remove(index)"><Trash2 :size="17" /></button>
      </div>
    </div>
  </div>
</template>
