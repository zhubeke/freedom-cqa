<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { MoreHorizontal } from "lucide-vue-next";
export interface ConversationMenuItem { id: string; label: string; destructive?: boolean; disabled?: boolean }
const props = defineProps<{ label: string; items: ConversationMenuItem[] }>();
const emit = defineEmits<{ select: [id: string] }>();
const open = ref(false); const trigger = ref<HTMLButtonElement>(); const menu = ref<HTMLElement>();
const position = ref({ top: "0px", left: "0px" });
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus({ preventScroll: true }); }
async function toggle() {
  if (open.value) { close(); return; }
  const rect = trigger.value!.getBoundingClientRect();
  position.value = { left: `${Math.max(8, Math.min(window.innerWidth - 224, rect.right - 216))}px`, top: `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - props.items.length * 40 - 16))}px` };
  open.value = true; await nextTick(); menu.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
}
function outside(event: Event) { if (!trigger.value?.contains(event.target as Node) && !menu.value?.contains(event.target as Node)) close(); }
function viewportChanged() { close(); }
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(true); }
  if (event.key === "Tab") close();
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); const items = [...(menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}
document.addEventListener("pointerdown", outside); window.addEventListener("resize", viewportChanged); window.addEventListener("scroll", viewportChanged, true);
onBeforeUnmount(() => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", viewportChanged); window.removeEventListener("scroll", viewportChanged, true); });
</script>

<template>
  <button ref="trigger" type="button" class="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" :aria-label="label" aria-haspopup="menu" :aria-expanded="open" @click="toggle" @keydown.down.prevent="!open && toggle"><MoreHorizontal :size="19" aria-hidden="true" /></button>
  <Teleport to="body"><div v-if="open" ref="menu" role="menu" :aria-label="label" class="fixed z-[70] w-[216px] rounded-md border border-line bg-white p-1 shadow-lg" :style="position" @keydown="keyboard"><button v-for="item in items" :key="item.id" type="button" role="menuitem" class="flex min-h-9 w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-40" :class="item.destructive ? 'text-red-700' : 'text-ink'" :disabled="item.disabled" @click="close(true); emit('select', item.id)">{{ item.label }}</button></div></Teleport>
</template>
