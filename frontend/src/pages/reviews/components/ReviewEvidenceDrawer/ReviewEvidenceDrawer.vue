<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { AlertTriangle, LoaderCircle, X } from "lucide-vue-next";
import { apiGet } from "../../../../api/client";
import TranscriptMessage from "../../../../components/TranscriptMessage/TranscriptMessage.vue";
import SystemEventMessage from "../../../../components/SystemEventMessage/SystemEventMessage.vue";
import type { Appeal } from "../../../../shared/types/appeal";
import type { ConversationDetail } from "../../../../shared/types/conversation";
import { resolveEvidence } from "../../review-model";

const props = defineProps<{ appeal: Appeal; evidenceIds: string[]; evidenceTurns: number[]; focusedReference?: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const scroller = ref<HTMLElement>();
const focusedId = ref<string | null>(null);
const localWarning = ref("");
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
const query = useQuery({
  queryKey: computed(() => ["conversation", props.appeal.conversation_id, props.appeal.dataset_group_id]),
  queryFn: ({ signal }) => apiGet<ConversationDetail>(`/v1/conversations/${encodeURIComponent(props.appeal.conversation_id)}?datasetGroupId=${encodeURIComponent(props.appeal.dataset_group_id)}`, signal),
  retry: 1
});
const references = computed(() => resolveEvidence(query.data.value?.transcript ?? [], props.evidenceIds, props.evidenceTurns));
const highlighted = computed(() => new Set(references.value.flatMap(reference => reference.messageId ? [reference.messageId] : [])));
const warnings = computed(() => [...new Set(references.value.flatMap(reference => reference.warning ? [reference.warning] : []))]);

async function scrollToReference(key?: string) {
  const reference = key ? references.value.find(item => item.key === key || item.messageId === key) : references.value.find(item => item.messageId);
  localWarning.value = "";
  if (key && !reference) { localWarning.value = `Evidence reference “${key}” could not be resolved.`; return; }
  if (!reference?.messageId) return;
  await nextTick();
  const container = scroller.value;
  const target = [...(container?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [])].find(element => element.dataset.messageId === reference.messageId);
  if (!target || !container) { localWarning.value = `Evidence reference “${reference.label}” is unavailable.`; return; }
  focusedId.value = reference.messageId;
  const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - Math.min(100, container.clientHeight / 4);
  container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
watch([() => query.data.value, () => props.focusedReference], ([conversation]) => { if (conversation) void scrollToReference(props.focusedReference); }, { immediate: true });
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="evidence-drawer" aria-labelledby="review-evidence-title" @cancel.prevent="emit('close')" @click="event => { if (event.target === dialog) emit('close'); }">
      <div class="flex h-full min-h-0 flex-col bg-white">
        <header class="shrink-0 border-b border-line p-4 sm:px-6">
          <div class="flex items-center justify-between gap-3"><h2 id="review-evidence-title" class="text-base font-bold">Review evidence</h2><button type="button" class="icon-button !size-8 !rounded-md" aria-label="Close evidence drawer" autofocus @click="emit('close')"><X :size="20" /></button></div>
          <p class="mt-1 text-xs text-muted">Conversation: <span class="font-medium text-ink">{{ appeal.conversation_id }}</span></p>
          <p class="mt-1 text-sm font-semibold">{{ appeal.criterion_name }}</p>
        </header>
        <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" tabindex="0" aria-label="Evidence and original transcript">
          <section class="mb-5 border-b border-line pb-4"><h3 class="text-xs font-bold uppercase tracking-wide text-muted">Original AI rationale</h3><p class="mt-2 whitespace-pre-wrap text-sm leading-6">{{ appeal.original_evaluation.explanation || 'No original rationale was recorded.' }}</p></section>
          <div v-if="query.isPending.value" role="status" class="flex items-center justify-center gap-2 py-12 text-sm text-muted"><LoaderCircle :size="18" class="animate-spin" />Loading transcript…</div>
          <div v-else-if="query.isError.value" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-800"><p>{{ query.error.value?.message }}</p><button class="mt-2 font-semibold underline" type="button" @click="query.refetch()">Try again</button></div>
          <template v-else-if="query.data.value">
            <div v-if="warnings.length || localWarning" role="alert" class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div class="flex items-center gap-2 font-semibold"><AlertTriangle :size="16" />Evidence warning</div><p v-for="warning in warnings" :key="warning" class="mt-1 break-words">{{ warning }}</p><p v-if="localWarning" class="mt-1">{{ localWarning }}</p></div>
            <p v-if="!references.length" class="mb-4 rounded-md bg-surface p-3 text-sm text-muted">No evidence references were recorded. The complete original transcript is available below.</p>
            <nav v-else class="mb-4 flex flex-wrap gap-2" aria-label="Evidence references"><button v-for="reference in references" :key="reference.key" type="button" class="min-h-8 rounded border border-line px-2 text-xs font-medium hover:bg-surface disabled:text-amber-800" :disabled="!reference.messageId" :aria-pressed="focusedId === reference.messageId" @click="scrollToReference(reference.key)">{{ reference.label }}{{ reference.warning ? ' · unavailable' : '' }}</button></nav>
            <div class="mb-4 flex items-center justify-between gap-2"><h3 class="text-xs font-bold uppercase tracking-wide text-muted">Transcript</h3><span class="text-xs text-muted">{{ query.data.value.transcript.length }} messages · Original order</span></div>
            <div v-if="query.data.value.transcript.length" class="space-y-4">
              <template v-for="(message, index) in query.data.value.transcript" :key="message.message_id">
                <div><p class="mb-2 text-[11px] text-muted" :class="{ 'font-semibold text-amber-800': highlighted.has(message.message_id) }">{{ highlighted.has(message.message_id) ? 'Evidence · ' : '' }}Turn {{ index + 1 }} · <code class="select-all font-normal">{{ message.message_id }}</code></p><SystemEventMessage v-if="message.speaker === 'system'" :message="message" :highlighted="highlighted.has(message.message_id)" /><TranscriptMessage v-else :message="message" :voice-call="query.data.value.normalized_channel === 'call'" :highlighted="highlighted.has(message.message_id)" /></div>
              </template>
            </div>
            <p v-else class="py-8 text-center text-sm text-muted">This conversation has no transcript messages.</p>
          </template>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.evidence-drawer { position: fixed; inset: 0 0 0 auto; width: min(46rem, 100vw); height: 100dvh; max-width: 100vw; max-height: 100dvh; margin: 0 0 0 auto; padding: 0; border: 0; border-left: 1px solid var(--color-line); color: var(--color-ink); box-shadow: -12px 0 60px #0002; }
.evidence-drawer::backdrop { background: #0f172a66; }
@media (prefers-reduced-motion: reduce) { .evidence-drawer :deep(*) { transition-duration: 0s !important; animation-duration: 0s !important; } }
</style>
