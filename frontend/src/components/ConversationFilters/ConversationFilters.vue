<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import type { ConversationLanguage } from "../../shared/types/conversation";

const language = defineModel<ConversationLanguage>("language", { required: true });

const languages: Array<{ value: ConversationLanguage; label: string }> = [
  { value: "all", label: "All languages" },
  { value: "kk", label: "Қазақша" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" }
];
</script>

<template>
  <div class="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Filter by language">
    <Languages class="mr-1 shrink-0 text-muted" :size="18" aria-hidden="true" />
    <button
      v-for="item in languages"
      :key="item.value"
      type="button"
      class="min-h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold transition-colors"
      :class="language === item.value ? 'bg-primary-soft text-primary' : 'bg-surface text-muted hover:bg-surface-strong hover:text-ink'"
      :aria-pressed="language === item.value"
      @click="language = item.value"
    >
      {{ item.label }}
    </button>
  </div>
</template>
