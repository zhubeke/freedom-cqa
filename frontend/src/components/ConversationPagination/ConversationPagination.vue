<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
defineProps<{ page: number; totalPages: number; total: number }>();
defineEmits<{ change: [page: number] }>();
</script>
<template>
  <div v-if="totalPages > 0" class="flex items-center justify-between border-t border-line px-4 py-4 sm:px-6">
    <p class="text-xs text-muted">{{ total }} conversations</p><div class="flex items-center gap-2">
      <button type="button" :disabled="page <= 1" class="grid size-9 place-items-center rounded-xl border border-line disabled:opacity-30" aria-label="Previous page" @click="$emit('change', page - 1)"><ChevronLeft :size="17" /></button>
      <span class="min-w-20 text-center text-xs font-semibold">{{ page }} / {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages" class="grid size-9 place-items-center rounded-xl border border-line disabled:opacity-30" aria-label="Next page" @click="$emit('change', page + 1)"><ChevronRight :size="17" /></button>
    </div>
  </div>
</template>
