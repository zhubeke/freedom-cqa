<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { GripVertical, RotateCcw } from "lucide-vue-next";
import EvaluationPanel from "../EvaluationPanel/EvaluationPanel.vue";
import RecommendedActionCard from "../RecommendedActionCard/RecommendedActionCard.vue";
import ConversationSentimentTimeline from "../ConversationSentimentTimeline/ConversationSentimentTimeline.vue";
import ConversationMetadataPanel from "../ConversationMetadataPanel/ConversationMetadataPanel.vue";
import AudioIntelligencePanel from "../AudioIntelligencePanel/AudioIntelligencePanel.vue";
import ConversationInfo from "../ConversationInfo/ConversationInfo.vue";
import EvaluationSummary from "../EvaluationSummary/EvaluationSummary.vue";
import AnalysisViewToggle from "../AnalysisViewToggle/AnalysisViewToggle.vue";
import ConversationOverview from "../ConversationOverview/ConversationOverview.vue";
import { useAnalysisView } from "../../shared/use-analysis-view";
import type { ConversationDetail } from "../../shared/types/conversation";
import type { EvaluationRun } from "../../shared/types/evaluation";

type TabId = "evaluation" | "follow-up" | "sentiment" | "metadata";
interface Tab { id: TabId; label: string }
const defaultTabs: Tab[] = [
  { id: "evaluation", label: "Evaluation" },
  { id: "follow-up", label: "Follow-up" },
  { id: "sentiment", label: "Sentiment" },
  { id: "metadata", label: "Conversation details" }
];
const storageKey = "cqa-analysis-tab-order-v1";
function initialTabs(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
    if (saved.length === defaultTabs.length && defaultTabs.every((tab) => saved.includes(tab.id))) {
      return saved.map((id) => defaultTabs.find((tab) => tab.id === id)!);
    }
  } catch { /* Invalid preferences are safely reset. */ }
  return defaultTabs.map((tab) => ({ ...tab }));
}

const props = defineProps<{ conversation: ConversationDetail; evaluationRunId?: string }>();
const emit = defineEmits<{ evidence: [messageId: string] }>();
const tabs = ref(initialTabs());
const active = ref<TabId>("evaluation");
const mode = useAnalysisView("cqa-conversation-analysis-view");
const tabButtons = ref<HTMLElement[]>([]);
const visited = ref(new Set<TabId>([active.value]));
const selectedRun = ref<EvaluationRun | null | undefined>(undefined);
watch(() => props.conversation.conversation_id, () => { selectedRun.value = undefined; });
watch(() => props.evaluationRunId, () => { selectedRun.value = undefined; });
watch(active, (tab) => { visited.value = new Set([...visited.value, tab]); });

function saveOrder(): void { try { localStorage.setItem(storageKey, JSON.stringify(tabs.value.map((tab) => tab.id))); } catch { /* Storage may be unavailable in private sessions. */ } }
function resetOrder(): void { tabs.value = defaultTabs.map((tab) => ({ ...tab })); saveOrder(); }
async function focusTab(next: number): Promise<void> {
  active.value = tabs.value[next]!.id;
  await nextTick();
  const button = tabButtons.value[next];
  button?.focus({ preventScroll: true });
  if (button?.parentElement) button.parentElement.scrollTo({ left: button.offsetLeft - button.parentElement.offsetLeft, behavior: "smooth" });
}
function moveFocus(index: number, delta: number): void {
  void focusTab((index + delta + tabs.value.length) % tabs.value.length);
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-white" aria-label="Conversation analysis">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div><h2 class="text-sm font-semibold text-ink">Analysis</h2><p class="mt-0.5 text-xs text-muted">{{ mode === 'simple' ? 'Key results and what needs attention.' : 'All criteria, evidence, and analysis details.' }}</p></div>
      <AnalysisViewToggle v-model="mode" />
    </div>
    <EvaluationSummary :conversation-id="conversation.conversation_id" :dataset-group-id="conversation.dataset_group_id" :selected-run="selectedRun" :requested-run-id="evaluationRunId" />
    <div v-show="mode === 'advanced'" class="shrink-0 border-b border-line px-2 sm:px-3">
      <div class="flex items-start gap-2">
        <VueDraggable v-model="tabs" role="tablist" aria-label="Analysis sections; drag handles to reorder" class="flex min-w-0 flex-1 flex-wrap" handle=".drag-handle" :animation="160" @end="saveOrder">
          <button
            v-for="(tab, index) in tabs"
            :key="tab.id"
            :ref="(element) => { if (element) tabButtons[index] = element as HTMLElement }"
            type="button"
            role="tab"
            :id="`analysis-tab-${tab.id}`"
            :aria-label="tab.label"
            class="group inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors"
            :class="active === tab.id ? 'border-slate-700 font-bold text-slate-900' : 'border-transparent font-medium text-muted hover:bg-surface hover:text-ink'"
            :aria-selected="active === tab.id"
            :aria-controls="`analysis-panel-${tab.id}`"
            :tabindex="active === tab.id ? 0 : -1"
            @click="active = tab.id"
            @keydown.right.prevent="moveFocus(index, 1)"
            @keydown.left.prevent="moveFocus(index, -1)"
            @keydown.home.prevent="focusTab(0)"
            @keydown.end.prevent="focusTab(tabs.length - 1)"
          >
            <GripVertical class="drag-handle cursor-grab text-muted/70 active:cursor-grabbing" :size="15" aria-label="Drag to reorder tab" />
            {{ tab.label }}
          </button>
        </VueDraggable>
        <button type="button" class="icon-button my-1 size-9" title="Reset tab order" aria-label="Reset tab order" @click="resetOrder"><RotateCcw :size="16" /></button>
      </div>
    </div>
    <div class="analysis-scroll min-h-0 space-y-3 bg-surface/40 p-2 sm:p-3 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
      <div v-show="mode === 'simple' || active === 'evaluation'" id="analysis-panel-evaluation" :role="mode === 'advanced' ? 'tabpanel' : undefined" :aria-labelledby="mode === 'advanced' ? 'analysis-tab-evaluation' : undefined" tabindex="0"><EvaluationPanel :mode="mode" :conversation-id="conversation.conversation_id" :dataset-group-id="conversation.dataset_group_id" :transcript="conversation.transcript" :requested-run-id="evaluationRunId" @selected-run="selectedRun = $event" @evidence="emit('evidence', $event)" /></div>
      <div v-if="mode === 'simple' || visited.has('follow-up')" v-show="mode === 'simple' || active === 'follow-up'" id="analysis-panel-follow-up" :role="mode === 'advanced' ? 'tabpanel' : undefined" :aria-labelledby="mode === 'advanced' ? 'analysis-tab-follow-up' : undefined" tabindex="0"><RecommendedActionCard :mode="mode" :conversation-id="conversation.conversation_id" :dataset-group-id="conversation.dataset_group_id" @evidence="emit('evidence', $event)" /></div>
      <ConversationOverview v-if="mode === 'simple'" :conversation="conversation" />
      <div v-if="visited.has('sentiment')" v-show="mode === 'advanced' && active === 'sentiment'" id="analysis-panel-sentiment" role="tabpanel" aria-labelledby="analysis-tab-sentiment" tabindex="0"><ConversationSentimentTimeline :conversation="conversation" @message="emit('evidence', $event)" /></div>
      <div v-if="visited.has('metadata')" v-show="mode === 'advanced' && active === 'metadata'" id="analysis-panel-metadata" role="tabpanel" aria-labelledby="analysis-tab-metadata" tabindex="0" class="space-y-3">
        <ConversationInfo :conversation="conversation" />
        <ConversationMetadataPanel :conversation="conversation" @evidence="emit('evidence', $event)" />
        <AudioIntelligencePanel :conversation-id="conversation.conversation_id" :dataset-group-id="conversation.dataset_group_id" :has-audio="conversation.has_audio" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.analysis-scroll :deep(section[aria-labelledby="recommended-action-title"]),
.analysis-scroll :deep(section[aria-labelledby="sentiment-timeline-title"]),
.analysis-scroll :deep(section[aria-labelledby="metadata-title"]) { border-radius: .5rem; }
.analysis-scroll :deep(section[aria-labelledby="recommended-action-title"]) { padding: 1rem; }
.analysis-scroll :deep(section[aria-labelledby="sentiment-timeline-title"] > div),
.analysis-scroll :deep(section[aria-labelledby="metadata-title"] > div) { padding: .875rem 1rem; }
</style>
