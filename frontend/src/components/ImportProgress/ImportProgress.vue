<script setup lang="ts">
import { computed } from "vue";
import type { ImportStatus } from "../../shared/types/conversation";
const props = defineProps<{ status: ImportStatus }>();
const percent = computed(() => props.status.total_records ? Math.round(props.status.processed_count / props.status.total_records * 100) : 0);
</script>
<template>
  <div class="rounded-2xl bg-surface p-4" aria-live="polite">
    <div class="flex items-center justify-between text-sm"><span class="font-semibold capitalize text-ink">{{ status.status }}</span><span class="text-muted">{{ status.processed_count }} / {{ status.total_records }}</span></div>
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${percent}%` }" /></div>
    <p v-if="status.error" class="mt-3 text-sm text-primary" role="alert">{{ status.error }}</p>
  </div>
</template>
