<script setup lang="ts">
import { LoaderCircle, X } from "lucide-vue-next";
import type { LifecycleAction } from "../../api/conversations";
import { nextTick, ref, watch } from "vue";
const props = defineProps<{ open: boolean; action: LifecycleAction; count: number; pending?: boolean; error?: string | null }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
watch(() => props.open, async open => {
  if (open) { previousFocus = document.activeElement as HTMLElement | null; await nextTick(); dialog.value?.focus(); }
  else previousFocus?.focus({ preventScroll: true });
});
function close() { if (!props.pending) emit("close"); }
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); }
  if (event.key !== "Tab" || !dialog.value) return;
  const buttons = [...dialog.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
}
</script>

<template>
  <Teleport to="body"><div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" @click.self="close" @keydown="keyboard">
    <div ref="dialog" tabindex="-1" role="dialog" aria-modal="true" :aria-labelledby="`conversation-${action}-title`" class="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-lg">
      <div class="flex items-center justify-between"><h2 :id="`conversation-${action}-title`" class="text-lg font-bold capitalize">{{ action }} conversations</h2><button type="button" class="icon-button" aria-label="Close" :disabled="pending" @click="close"><X :size="19" /></button></div>
      <p class="mt-4 text-sm leading-6 text-muted">This will affect <strong class="text-ink">{{ count }}</strong> conversation{{ count === 1 ? '' : 's' }}.</p>
      <p v-if="action === 'delete'" class="mt-2 text-sm text-muted">Deletion is recoverable: conversations and their evaluations, evidence, reports, appeals, and source imports are retained.</p>
      <p v-else-if="action === 'archive'" class="mt-2 text-sm text-muted">Archived conversations keep their transcript and analyses and can be restored from the Archived view.</p>
      <p v-if="error" class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{{ error }}</p>
      <div class="mt-5 flex justify-end gap-3"><button type="button" class="button-secondary !min-h-9 !rounded-md" :disabled="pending" @click="close">Cancel</button><button type="button" class="button-primary !min-h-9 !rounded-md" :class="action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''" :disabled="pending" @click="$emit('confirm')"><LoaderCircle v-if="pending" class="animate-spin" :size="16" /> Confirm {{ action }}</button></div>
    </div>
  </div></Teleport>
</template>
