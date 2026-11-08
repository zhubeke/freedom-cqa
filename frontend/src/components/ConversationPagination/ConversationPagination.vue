<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
defineProps<{ page: number; totalPages: number; total: number }>();
defineEmits<{ change: [page: number] }>();
</script>
<template>
  <div v-if="totalPages > 0" class="flex flex-col items-center justify-between gap-3 border-t border-line bg-white px-4 py-4 sm:flex-row sm:px-6">
    <p class="text-xs text-muted"><span class="font-bold text-ink">{{ total }}</span> conversations in this view</p><div class="flex items-center gap-2">
      <button type="button" :disabled="page <= 1" class="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted transition hover:border-primary/30 hover:text-primary disabled:opacity-30" aria-label="Previous page" @click="$emit('change', page - 1)"><ChevronLeft :size="17" /></button>
      <span class="min-w-24 text-center text-xs font-semibold text-muted">Page <strong class="text-ink">{{ page }}</strong> of {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages" class="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted transition hover:border-primary/30 hover:text-primary disabled:opacity-30" aria-label="Next page" @click="$emit('change', page + 1)"><ChevronRight :size="17" /></button>
    </div>
  </div>
</template>
