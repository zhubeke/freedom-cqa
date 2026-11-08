<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Headphones, MessageCircle, Phone, RotateCw, ShieldAlert } from "lucide-vue-next";
import { useRoute } from "vue-router";
import ConversationEmptyState from "../ConversationEmptyState/ConversationEmptyState.vue";
import ConversationMenu from "../ConversationMenu/ConversationMenu.vue";
import { conversationKey } from "../../api/conversations";
import { scoreTone } from "../../shared/evaluation-display";
import type { Conversation, ConversationSortKey } from "../../shared/types/conversation";
import { ACTION_LABELS } from "../../shared/types/action";
const props = withDefaults(defineProps<{
  conversations: Conversation[]; hasActiveFilters?: boolean; loading?: boolean; error?: string | null;
  errorTitle?: string; selectedKeys?: string[]; lifecycle?: "active" | "archived" | "deleted";
  selectionMode?: boolean; allMatching?: boolean; busy?: boolean;
  sortBy?: ConversationSortKey; sortDirection?: "asc" | "desc";
}>(), { hasActiveFilters: false, loading: false, error: null, errorTitle: "Couldn’t load conversations", selectedKeys: () => [], lifecycle: "active", selectionMode: false, allMatching: false, busy: false, sortBy: "conversation_id", sortDirection: "asc" });
const emit = defineEmits<{ retry: []; import: []; clearFilters: []; toggle: [conversation: Conversation]; togglePage: []; select: [conversation: Conversation]; export: [conversation: Conversation]; action: [action: "archive" | "unarchive" | "delete" | "restore", conversation: Conversation]; sort: [key: ConversationSortKey] }>();
const route = useRoute();
const columns: Array<{ key: ConversationSortKey; label: string }> = [{ key: "conversation_id", label: "Conversation" }, { key: "channel", label: "Channel" }, { key: "duration", label: "Duration" }, { key: "language", label: "Language" }, { key: "score", label: "Score" }, { key: "status", label: "Status" }, { key: "action", label: "Action" }];
const selectedOnPage = computed(() => props.conversations.filter((item) => props.allMatching || props.selectedKeys.includes(conversationKey(item))).length);
const allVisibleSelected = computed(() => props.conversations.length > 0 && selectedOnPage.value === props.conversations.length);
function duration(milliseconds: number | null) { if (milliseconds == null) return "—"; const seconds = Math.floor(milliseconds / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function menuItems() { return [props.lifecycle === "deleted" ? { id: "restore", label: "Restore" } : { id: props.lifecycle === "active" ? "archive" : "unarchive", label: props.lifecycle === "active" ? "Archive" : "Unarchive" }, { id: "export", label: "Export JSON" }, { id: "select", label: "Select" }, ...(props.lifecycle !== "deleted" ? [{ id: "delete", label: "Delete", destructive: true }] : [])]; }
function menuAction(id: string, conversation: Conversation) { if (id === "select") emit("select", conversation); else if (id === "export") emit("export", conversation); else emit("action", id as "archive" | "unarchive" | "delete" | "restore", conversation); }
const statusLabel = (status?: string) => ({ completed: "Completed", queued: "Queued", processing: "Evaluating", waiting: "Waiting", failed: "Failed", pending: "Not evaluated" }[status ?? "pending"] ?? status);
</script>
<template>
  <div aria-live="polite">
    <div v-if="loading" class="space-y-2 p-4" aria-label="Loading conversations" aria-busy="true"><div v-for="item in 5" :key="item" class="h-12 animate-pulse rounded bg-surface" /></div>
    <div v-else-if="error" class="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center" role="alert"><AlertCircle :size="24" class="text-red-700" aria-hidden="true" /><h2 class="mt-3 font-bold text-ink">{{ errorTitle }}</h2><p class="mt-2 max-w-md text-sm text-muted">{{ error }}</p><button type="button" class="button-secondary mt-4" @click="emit('retry')"><RotateCw :size="15" /> Retry</button></div>
    <ConversationEmptyState v-else-if="conversations.length === 0" :filtered="hasActiveFilters" @import="emit('import')" @clear-filters="emit('clearFilters')" />
    <div v-else class="overflow-x-auto" tabindex="0" aria-label="Conversation table, scroll horizontally for all columns">
      <table class="w-full min-w-[820px] border-collapse text-left text-sm" aria-label="Conversations">
        <thead class="border-b border-line bg-surface/60 text-xs text-muted"><tr>
          <th v-if="selectionMode" scope="col" class="w-10 px-3 py-2"><input type="checkbox" class="size-4 accent-primary" aria-label="Select all conversations on this page" :checked="allVisibleSelected" :indeterminate="selectedOnPage > 0 && !allVisibleSelected" :disabled="busy" @change="emit('togglePage')" /></th>
          <th v-for="column in columns" :key="column.key" scope="col" class="px-3 py-2 font-semibold" :aria-sort="sortBy === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'"><button type="button" class="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-primary" @click="emit('sort', column.key)">{{ column.label }}<ArrowUp v-if="sortBy === column.key && sortDirection === 'asc'" :size="12" aria-hidden="true" /><ArrowDown v-else-if="sortBy === column.key" :size="12" aria-hidden="true" /><ArrowUpDown v-else :size="11" class="opacity-40" aria-hidden="true" /></button></th>
          <th scope="col" class="w-12 px-2"><span class="sr-only">More actions</span></th>
        </tr></thead>
        <tbody class="divide-y divide-line/80"><tr v-for="conversation in conversations" :key="conversationKey(conversation)" class="h-14 transition-colors hover:bg-surface/55" :class="selectionMode && (allMatching || selectedKeys.includes(conversationKey(conversation))) ? 'bg-primary-soft/60' : 'bg-white'">
          <td v-if="selectionMode" class="w-10 px-3"><input type="checkbox" class="size-4 accent-primary" :aria-label="`Select conversation ${conversation.conversation_id}`" :checked="allMatching || selectedKeys.includes(conversationKey(conversation))" :disabled="busy" @change="emit('toggle', conversation)" /></td>
          <th scope="row" class="px-3 py-2 font-semibold"><RouterLink :to="{ name: 'conversation-detail', params: { id: conversation.conversation_id }, query: { from: route.fullPath, datasetGroupId: conversation.dataset_group_id } }" class="whitespace-nowrap rounded text-ink hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">{{ conversation.conversation_id }}</RouterLink><span v-if="conversation.has_audio" class="ml-2 inline-flex text-muted" title="Audio available"><Headphones :size="12" aria-label="Audio available" /></span></th>
          <td class="px-3 py-2"><span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"><Phone v-if="conversation.channel === 'call'" :size="14" aria-hidden="true" /><MessageCircle v-else :size="14" aria-hidden="true" />{{ conversation.channel === 'call' ? 'Call' : 'Chat' }}</span></td>
          <td class="px-3 py-2 text-xs tabular-nums text-muted">{{ duration(conversation.duration_ms) }}</td>
          <td class="px-3 py-2 text-xs text-muted">{{ conversation.language === 'kk' ? 'KZ' : conversation.language.toUpperCase() }}</td>
          <td class="whitespace-nowrap px-3 py-2"><span class="font-semibold tabular-nums" :class="scoreTone(conversation.quality_score)">{{ conversation.quality_score == null ? '—' : conversation.quality_score.toFixed(2) }}</span><ShieldAlert v-if="conversation.critical_flag" :size="13" class="ml-1 inline text-red-700" aria-label="Severe violation" /><span v-if="conversation.score_reviewed" class="ml-1 text-[10px] text-muted" title="Reviewer-finalized score">Reviewed</span></td>
          <td class="whitespace-nowrap px-3 py-2"><span class="rounded px-1.5 py-1 text-[11px] font-medium" :class="conversation.evaluation_status === 'failed' ? 'bg-red-50 text-red-700' : ['queued','processing','waiting'].includes(conversation.evaluation_status ?? '') ? 'bg-amber-50 text-amber-800' : 'bg-surface text-muted'">{{ statusLabel(conversation.evaluation_status) }}</span></td>
          <td class="max-w-52 px-3 py-2 text-xs leading-4 text-muted">{{ conversation.recommended_action ? ACTION_LABELS[conversation.recommended_action] : 'Awaiting analysis' }}</td>
          <td class="px-2 py-2"><ConversationMenu :label="`More actions for ${conversation.conversation_id}`" :items="menuItems()" @select="menuAction($event, conversation)" /></td>
        </tr></tbody>
      </table>
    </div>
  </div>
</template>
