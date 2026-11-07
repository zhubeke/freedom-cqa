<script setup lang="ts">
import { Bot, Headphones, UserRound } from "lucide-vue-next";
import { computed } from "vue";
import type { TranscriptEntry } from "../../shared/types/conversation";

const props = defineProps<{ message: TranscriptEntry; highlighted?: boolean; voiceCall?: boolean }>();
const isOperator = computed(() => props.message.speaker === "operator");
const label = computed(() => ({ client: "Client", operator: "Operator", bot: "Bot", system: "System" })[props.message.speaker]);
const readableTimestamp = computed(() => {
  if (!props.voiceCall) return props.message.timestamp;
  const value = new Date(props.message.timestamp);
  if (Number.isNaN(value.getTime())) return props.message.timestamp;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(value);
});
</script>

<template>
  <article
    :id="message.message_id"
    :data-message-id="message.message_id"
    class="flex scroll-mt-28 transition duration-500"
    :class="isOperator ? 'justify-end' : 'justify-start'"
  >
    <div class="max-w-[88%] sm:max-w-[78%]">
      <div class="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold" :class="isOperator ? 'justify-end text-primary' : 'text-muted'">
        <Bot v-if="message.speaker === 'bot'" :size="14" aria-hidden="true" />
        <UserRound v-else-if="message.speaker === 'client'" :size="14" aria-hidden="true" />
        <Headphones v-else :size="14" aria-hidden="true" />
        {{ label }}
      </div>
      <div
        class="rounded-2xl px-4 py-3 ring-offset-2 transition duration-500 sm:px-5"
        :class="[
          isOperator ? 'rounded-br-md bg-primary-soft' : message.speaker === 'bot' ? 'rounded-bl-md border border-line bg-white' : 'rounded-bl-md bg-surface-strong',
          highlighted ? 'ring-3 ring-amber-300' : ''
        ]"
      >
        <p class="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{{ message.text }}</p>
        <div class="mt-2 text-[0.68rem] text-muted">
          <time :datetime="message.timestamp">{{ readableTimestamp }}</time>
        </div>
      </div>
    </div>
  </article>
</template>
