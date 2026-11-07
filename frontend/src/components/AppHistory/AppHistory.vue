<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { isNativeUndoTarget, useHistoryStore } from "../../app/history";

const history = useHistoryStore();
const { notices } = storeToRefs(history);
function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isNativeUndoTarget(event.target)) return;
  const key = event.key.toLowerCase();
  const direction = key === "y" || (key === "z" && event.shiftKey) ? "redo" : key === "z" ? "undo" : null;
  if (!direction || !(direction === "undo" ? history.canUndo : history.canRedo)) return;
  event.preventDefault();
  void history[direction]();
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2" aria-live="polite" aria-atomic="true">
      <button v-for="notice in notices" :key="notice.id" type="button" class="pointer-events-auto rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-lg" :class="notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-line bg-white text-ink'" @click="history.dismissNotice(notice.id)">
        {{ notice.message }}
      </button>
    </div>
  </Teleport>
</template>
