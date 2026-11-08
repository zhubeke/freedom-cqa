<script setup lang="ts">
import { computed } from "vue";
import type { TranscriptEntry } from "../../shared/types/conversation";

const props = defineProps<{ message: TranscriptEntry; highlighted?: boolean }>();
const time = computed(() => {
  const date = new Date(props.message.timestamp);
  if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  return props.message.timestamp;
});
</script>

<template>
  <div
    :id="message.message_id"
    :data-message-id="message.message_id"
    class="group rounded-md px-2 py-1 text-center transition-colors duration-200"
    :class="highlighted ? 'bg-amber-100 ring-2 ring-amber-300' : ''"
  >
    <div class="flex items-center gap-3 text-xs leading-5 text-muted" :title="`${message.text} · ${message.timestamp}`">
      <span class="h-px flex-1 bg-line" aria-hidden="true" />
      <span class="min-w-0 max-w-[80%] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><span class="font-medium text-ink/65">{{ message.text }}</span> · {{ time }}</span>
      <span class="h-px flex-1 bg-line" aria-hidden="true" />
      <span class="sr-only">Original timestamp: {{ message.timestamp }}</span>
    </div>
  </div>
</template>
