<script setup lang="ts">
import { Archive, ArchiveRestore, Download, Play, Trash2 } from "lucide-vue-next";
defineProps<{ count: number; total: number; allMatching: boolean; lifecycle: "active" | "archived" | "deleted"; pending?: boolean }>();
defineEmits<{ clear: []; allMatching: []; archive: []; unarchive: []; delete: []; restore: []; evaluate: []; export: [] }>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b border-line bg-primary-soft/60 px-3 py-2 text-xs" role="toolbar" aria-label="Selected conversation actions">
    <strong class="mr-1 text-ink">{{ allMatching ? total : count }} selected</strong>
    <button v-if="!allMatching && total > count" type="button" class="font-semibold text-primary underline disabled:opacity-40" :disabled="pending" @click="$emit('allMatching')">Select all {{ total }} matching results</button>
    <span v-else-if="allMatching" class="text-muted">All matching filtered results across pages</span>
    <div class="ml-auto flex flex-wrap gap-2">
      <button type="button" class="button-secondary !min-h-8 !rounded-md !px-2 !text-xs" :disabled="pending || !(allMatching ? total : count) || lifecycle === 'deleted'" @click="$emit('evaluate')"><Play :size="14" /> Evaluate</button>
      <button type="button" class="button-secondary !min-h-8 !rounded-md !px-2 !text-xs" :disabled="pending || !(allMatching ? total : count)" @click="$emit('export')"><Download :size="14" /> Export JSON</button>
      <button v-if="lifecycle === 'active'" type="button" class="button-secondary !min-h-8 !rounded-md !px-2 !text-xs" :disabled="pending || !(allMatching ? total : count)" @click="$emit('archive')"><Archive :size="14" /> Archive</button>
      <button v-if="lifecycle === 'archived'" type="button" class="button-secondary !min-h-8 !rounded-md !px-2 !text-xs" :disabled="pending || !(allMatching ? total : count)" @click="$emit('unarchive')"><ArchiveRestore :size="14" /> Unarchive</button>
      <button v-if="lifecycle === 'deleted'" type="button" class="button-secondary !min-h-8 !rounded-md !px-2 !text-xs" :disabled="pending || !(allMatching ? total : count)" @click="$emit('restore')"><ArchiveRestore :size="14" /> Restore</button>
      <button v-if="lifecycle !== 'deleted'" type="button" class="inline-flex min-h-8 items-center gap-2 rounded-md border border-red-200 bg-white px-2 font-semibold text-red-700 disabled:opacity-40" :disabled="pending || !(allMatching ? total : count)" @click="$emit('delete')"><Trash2 :size="14" /> Delete</button>
      <button type="button" class="min-h-8 rounded-md px-2 font-semibold text-muted hover:bg-white disabled:opacity-40" :disabled="pending" @click="$emit('clear')">Cancel</button>
    </div>
  </div>
</template>
