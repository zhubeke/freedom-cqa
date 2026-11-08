<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>
<template>
  <label class="inline-flex cursor-pointer items-center gap-3 text-sm font-medium" :class="{ 'opacity-60': disabled }">
    <span>{{ label }}</span><span class="relative inline-flex"><input type="checkbox" role="switch" class="peer sr-only" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" /><span class="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-slate-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-500 motion-reduce:transition-none" /><span class="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 motion-reduce:transition-none" /></span>
  </label>
</template>
