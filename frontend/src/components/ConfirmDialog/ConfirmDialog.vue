<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from "vue";
import { LoaderCircle, X } from "lucide-vue-next";

const props = withDefaults(defineProps<{ title: string; confirmLabel?: string; cancelLabel?: string; busy?: boolean; danger?: boolean }>(), {
  confirmLabel: "Confirm", cancelLabel: "Cancel", busy: false, danger: false
});
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
let previousFocus: HTMLElement | null = null;
function cancel() { if (!props.busy) emit("cancel"); }
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="confirmation-dialog" :aria-labelledby="titleId" :aria-busy="busy" @cancel.prevent="cancel" @click="event => { if (event.target === dialog) cancel(); }">
      <header class="flex items-center justify-between gap-4">
        <h2 :id="titleId" class="text-lg font-bold">{{ title }}</h2>
        <button type="button" class="icon-button !size-8 !rounded-md" aria-label="Close dialog" :disabled="busy" @click="cancel"><X :size="18" /></button>
      </header>
      <div class="mt-3 text-sm leading-6 text-muted"><slot /></div>
      <footer class="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" class="button-secondary !min-h-9 !rounded-md" autofocus :disabled="busy" @click="cancel">{{ cancelLabel }}</button>
        <button type="button" class="button-primary !min-h-9 !rounded-md" :class="{ '!bg-red-700 hover:!bg-red-800': danger }" :disabled="busy" @click="emit('confirm')"><LoaderCircle v-if="busy" :size="16" class="animate-spin" />{{ busy ? 'Working…' : confirmLabel }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.confirmation-dialog { position: fixed; inset: 0; width: min(32rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; overflow: auto; border: 1px solid var(--color-line); border-radius: .75rem; background: white; color: var(--color-ink); padding: 1.25rem; box-shadow: 0 16px 64px #0003; }
.confirmation-dialog::backdrop { background: #0f172a66; }
</style>
