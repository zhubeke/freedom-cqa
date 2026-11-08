<script setup lang="ts">
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
  <label class="sr-only" for="conversation-language">Language</label>
  <select id="conversation-language" v-model="language" class="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink sm:w-40" aria-label="Filter by language">
    <option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option>
  </select>
</template>
