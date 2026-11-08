<script setup lang="ts">
import { ChevronDown, Headphones, Info, MessageCircle, Phone } from "lucide-vue-next";
import { computed } from "vue";
import type { ConversationDetail } from "../../shared/types/conversation";

const props = defineProps<{ conversation: ConversationDetail }>();

function durationLabel(durationMs: number | null): string {
  if (durationMs === null) return "Unavailable";
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const rows = computed(() => [
  ["Operator name(s)", props.conversation.operator_names?.length ? props.conversation.operator_names.map((item) => item.name).join(", ") : "Not identified"],
  ["Dataset group", props.conversation.dataset_group_id],
  ["Channel", props.conversation.normalized_channel === "call" ? "Voice Call" : "Chat"],
  ["Language", props.conversation.original_language],
  ["Total messages", String(props.conversation.message_count)],
  ["Client", String(props.conversation.role_message_counts.client)],
  ["Operator", String(props.conversation.role_message_counts.operator)],
  ["Bot", String(props.conversation.role_message_counts.bot)],
  ["System", String(props.conversation.role_message_counts.system)],
  ["Duration", durationLabel(props.conversation.duration_ms)]
]);
</script>

<template>
  <aside aria-label="Conversation information">
    <details class="group overflow-hidden rounded-[1.5rem] bg-white lg:hidden">
      <summary class="flex min-h-16 list-none items-center justify-between px-5 font-bold text-ink [&::-webkit-details-marker]:hidden">
        <span class="inline-flex items-center gap-2"><Info :size="18" class="text-primary" aria-hidden="true" />Conversation information</span>
        <ChevronDown :size="18" class="text-muted transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div class="border-t border-line px-5 py-5">
        <dl class="space-y-3">
          <div v-for="row in rows" :key="row[0]" class="flex items-start justify-between gap-4 text-sm">
            <dt class="text-muted">{{ row[0] }}</dt><dd class="break-all text-right font-semibold text-ink">{{ row[1] }}</dd>
          </div>
        </dl>
        <div v-if="conversation.normalized_channel === 'call'" class="mt-5 flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-sm">
          <Headphones v-if="conversation.has_audio" :size="17" class="text-primary" aria-hidden="true" />
          <Phone v-else :size="17" class="text-muted" aria-hidden="true" />
          Recording {{ conversation.has_audio ? "available" : "unavailable" }}
        </div>
      </div>
    </details>

    <div class="hidden rounded-[1.5rem] bg-white p-6 lg:block">
      <div class="flex items-center gap-2"><Info :size="18" class="text-primary" aria-hidden="true" /><h2 class="font-bold text-ink">Conversation information</h2></div>
      <dl class="mt-6 space-y-4">
        <div v-for="row in rows" :key="row[0]" class="border-b border-line pb-3 last:border-0 last:pb-0">
          <dt class="text-xs text-muted">{{ row[0] }}</dt><dd class="mt-1 break-all text-sm font-semibold text-ink">{{ row[1] }}</dd>
        </div>
      </dl>
      <div v-if="conversation.normalized_channel === 'call'" class="mt-5 flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-sm">
        <Headphones v-if="conversation.has_audio" :size="17" class="text-primary" aria-hidden="true" />
        <Phone v-else :size="17" class="text-muted" aria-hidden="true" />
        Recording {{ conversation.has_audio ? "available" : "unavailable" }}
      </div>
      <div v-else class="mt-5 flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-sm text-muted">
        <MessageCircle :size="17" aria-hidden="true" /> Chat conversation
      </div>
    </div>
  </aside>
</template>
