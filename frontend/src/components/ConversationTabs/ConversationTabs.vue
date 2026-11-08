<script setup lang="ts">
import { LayoutList, MessageCircle, Phone } from "lucide-vue-next";
import type { Component } from "vue";
import type { ConversationTab } from "../../shared/types/conversation";

const model = defineModel<ConversationTab>({ required: true });

const tabs: Array<{ value: ConversationTab; label: string; icon: Component }> = [
  { value: "all", label: "All", icon: LayoutList },
  { value: "chat", label: "Chats", icon: MessageCircle },
  { value: "call", label: "Calls", icon: Phone }
];
</script>

<template>
  <div class="grid h-11 w-full grid-cols-3 gap-1 rounded-xl bg-surface p-1 sm:w-fit" role="tablist" aria-label="Conversation channel">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="model === tab.value"
      class="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors sm:min-w-24 sm:px-4"
      :class="model === tab.value ? 'bg-white text-primary shadow-[0_1px_2px_rgba(32,36,44,0.08)]' : 'text-muted hover:text-ink'"
      @click="model = tab.value"
    >
      <component :is="tab.icon" :size="17" :stroke-width="2" aria-hidden="true" />
      {{ tab.label }}
    </button>
  </div>
</template>
