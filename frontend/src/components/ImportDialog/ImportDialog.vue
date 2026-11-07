<script setup lang="ts">
import { ref } from "vue";
import { FileJson, X } from "lucide-vue-next";
import ImportProgress from "../ImportProgress/ImportProgress.vue";
import type { ImportStatus } from "../../shared/types/conversation";
defineProps<{ open: boolean; pending: boolean; status?: ImportStatus; error?: string | null }>();
const emit = defineEmits<{ close: []; import: [file: File] }>();
const file = ref<File>();
function select(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0]; }
</script>
<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4" @click.self="emit('close')">
    <section class="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div class="flex items-center justify-between"><h2 id="import-title" class="text-xl font-bold text-ink">Import conversations</h2><button type="button" class="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface" aria-label="Close" @click="emit('close')"><X :size="20" /></button></div>
      <ImportProgress v-if="status" class="mt-5" :status="status" />
      <template v-else>
        <label class="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-8 text-center">
          <FileJson :size="30" class="text-primary" /><span class="mt-3 text-sm font-semibold text-ink">Choose a JSON dataset</span><span class="mt-1 max-w-sm truncate text-xs text-muted">{{ file?.name ?? 'No file selected' }}</span>
          <input type="file" accept="application/json,.json" class="sr-only" @change="select" />
        </label>
        <p v-if="error" class="mt-3 text-sm text-primary" role="alert">{{ error }}</p>
        <button type="button" :disabled="!file || pending" class="mt-5 min-h-11 w-full rounded-2xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-40" @click="file && emit('import', file)">{{ pending ? 'Uploading…' : 'Start import' }}</button>
      </template>
    </section>
  </div>
</template>
