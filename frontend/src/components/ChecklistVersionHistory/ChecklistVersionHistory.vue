<script setup lang="ts">
import { Check } from "lucide-vue-next";
import type { ChecklistVersion } from "../../shared/types/checklist";
defineProps<{ versions: ChecklistVersion[]; activeVersionId: string | null; selectedVersionId?: string; activating?: boolean }>();
defineEmits<{ activate: [version: ChecklistVersion] }>();
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
</script>
<template>
  <div class="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
    <div class="border-b border-line px-5 py-4"><h2 class="font-extrabold">Version history</h2><p class="mt-1 text-xs text-muted">Every saved configuration is immutable.</p></div>
    <div class="divide-y divide-line">
      <div v-for="version in versions" :key="version.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4" :class="{ 'bg-primary-soft/40': version.id === selectedVersionId }">
        <div><div class="flex items-center gap-2"><strong>Version {{ version.version_number }}</strong><span v-if="version.id === activeVersionId" class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700"><Check :size="11" /> Active</span></div><p class="mt-1 text-xs text-muted">{{ formatDate(version.created_at) }} · {{ version.criteria.length }} criteria</p></div>
        <div class="flex flex-wrap gap-2"><RouterLink :to="`/checklists/${version.checklist_id}/versions/${version.id}`" class="button-secondary min-h-9 px-3 text-xs">View version {{ version.version_number }}</RouterLink><button v-if="version.id !== activeVersionId" type="button" class="button-secondary min-h-9 px-3 text-xs text-primary" :disabled="activating" @click="$emit('activate', version)">Make active</button></div>
      </div>
    </div>
  </div>
</template>
