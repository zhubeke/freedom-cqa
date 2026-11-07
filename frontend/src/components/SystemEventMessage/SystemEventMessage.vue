<script setup lang="ts">
import { Info } from "lucide-vue-next";
import type { TranscriptEntry } from "../../shared/types/conversation";

defineProps<{ message: TranscriptEntry; highlighted?: boolean }>();
</script>

<template>
  <div
    :id="message.message_id"
    :data-message-id="message.message_id"
    class="scroll-mt-28 rounded-2xl px-3 py-4 text-center transition duration-500"
    :class="highlighted ? 'bg-amber-100 ring-2 ring-amber-300' : ''"
  >
    <div class="inline-flex max-w-xl items-start justify-center gap-2 text-xs leading-5 text-muted">
      <Info class="mt-0.5 shrink-0" :size="14" aria-hidden="true" />
      <span><strong class="font-semibold text-ink/70">System · {{ message.timestamp }}</strong><br />{{ message.text }}</span>
    </div>
  </div>
</template>
