<script setup lang="ts">
defineProps<{ modelValue: "simple" | "advanced" }>();
const emit = defineEmits<{ "update:modelValue": [value: "simple" | "advanced"] }>();
</script>

<template>
  <div class="inline-flex shrink-0 rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Analysis view">
    <button v-for="view in (['simple', 'advanced'] as const)" :key="view" type="button"
      class="min-h-8 rounded px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="modelValue === view ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'"
      :aria-pressed="modelValue === view" @click="emit('update:modelValue', view)">
      {{ view === 'simple' ? 'Simple' : 'Advanced' }}
    </button>
  </div>
</template>
