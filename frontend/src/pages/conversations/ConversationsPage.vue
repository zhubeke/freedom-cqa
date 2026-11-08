<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useHistoryStore } from "../../app/history";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import ConversationFilters from "../../components/ConversationFilters/ConversationFilters.vue";
import ConversationList from "../../components/ConversationList/ConversationList.vue";
import ConversationSearch from "../../components/ConversationSearch/ConversationSearch.vue";
import ConversationTabs from "../../components/ConversationTabs/ConversationTabs.vue";
import ConversationPagination from "../../components/ConversationPagination/ConversationPagination.vue";
import ImportConversationsButton from "../../components/ImportConversationsButton/ImportConversationsButton.vue";
import ImportDialog from "../../components/ImportDialog/ImportDialog.vue";
import BatchEvaluationButton from "../../components/BatchEvaluationButton/BatchEvaluationButton.vue";
import BatchEvaluationDialog from "../../components/BatchEvaluationDialog/BatchEvaluationDialog.vue";
import BatchProgress from "../../components/BatchProgress/BatchProgress.vue";
import ConversationSelectionToolbar from "../../components/ConversationSelectionToolbar/ConversationSelectionToolbar.vue";
import ConversationActionDialog from "../../components/ConversationActionDialog/ConversationActionDialog.vue";
import ConversationMenu from "../../components/ConversationMenu/ConversationMenu.vue";
import ExportResultsDialog from "../../components/ExportResultsDialog/ExportResultsDialog.vue";
import BulkEvaluationDialog from "../../components/BulkEvaluationDialog/BulkEvaluationDialog.vue";
import type { ExportSelection } from "../../api/exports";
import { ApiError, apiGet, apiUpload } from "../../api/client";
import { conversationKey, mutateConversationLifecycle, resolveConversationSelection, type ConversationIdentity, type LifecycleAction } from "../../api/conversations";
import type {
  Conversation,
  ConversationListResponse,
  ConversationLanguage,
  ConversationTab,
  ConversationSortKey,
  ImportStatus
} from "../../shared/types/conversation";
import type { EvaluationBatch } from "../../shared/types/batch";
import { ACTION_CODES, ACTION_LABELS, type ActionCode } from "../../shared/types/action";

const route = useRoute();
const router = useRouter();
const queryValue = (value: unknown) => typeof value === "string" ? value : "";
const validLanguage = (value: string): value is ConversationLanguage => ["all", "kk", "ru", "en"].includes(value);
const validTab = (value: string): value is ConversationTab => ["all", "chat", "call"].includes(value);
const initialLanguage = queryValue(route.query.language);
const initialTab = queryValue(route.query.channel);
const searchQuery = ref(queryValue(route.query.search));
const language = ref<ConversationLanguage>(validLanguage(initialLanguage) ? initialLanguage : "all");
const activeTab = ref<ConversationTab>(validTab(initialTab) ? initialTab : "all");
const validAction = (value: string): value is ActionCode => ACTION_CODES.includes(value as ActionCode);
const initialAction = queryValue(route.query.action);
const action = ref<ActionCode | "all">(validAction(initialAction) ? initialAction : "all");
const page = ref(Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1));
const validSort = (value: string): value is ConversationSortKey => ["conversation_id", "channel", "duration", "language", "score", "status", "action"].includes(value);
const initialSort = queryValue(route.query.sortBy);
const sortBy = ref<ConversationSortKey>(validSort(initialSort) ? initialSort : "conversation_id");
const sortDirection = ref<"asc" | "desc">(queryValue(route.query.sortDirection) === "desc" ? "desc" : "asc");
const lifecycle = ref<"active" | "archived" | "deleted">(["archived", "deleted"].includes(queryValue(route.query.lifecycle)) ? queryValue(route.query.lifecycle) as "archived" | "deleted" : "active");
const dialogOpen = ref(false);
const batchDialogOpen = ref(false);
function dismissedBatchIds(): Set<string> { try { return new Set(JSON.parse(window.sessionStorage.getItem("cqa-dismissed-batches") ?? "[]") as string[]); } catch { return new Set(); } }
const storedBatchId = window.localStorage.getItem("cqa-active-batch-id") ?? "";
const activeBatchId = ref(dismissedBatchIds().has(storedBatchId) ? "" : storedBatchId);
const importId = ref<string>();
const queryClient = useQueryClient();
const history = useHistoryStore();
let syncingRoute = false;
type FilterState = [string, ConversationLanguage, ConversationTab, ActionCode | "all", "active" | "archived" | "deleted"];
const setFilters = ([search, nextLanguage, tab, nextAction, nextLifecycle]: FilterState) => {
  searchQuery.value = search; language.value = nextLanguage; activeTab.value = tab; action.value = nextAction; lifecycle.value = nextLifecycle;
};
watch([searchQuery, language, activeTab, action, lifecycle], (next, previous) => {
  if (!syncingRoute && previous) {
    const before = [...previous] as FilterState; const after = [...next] as FilterState;
    history.record({ label: "conversation filters", mergeKey: "conversation-filters", undo: () => setFilters(before), redo: () => setFilters(after) });
  }
  if (!syncingRoute) page.value = 1;
});
watch([searchQuery, language, activeTab, action, lifecycle, page, sortBy, sortDirection], () => {
  if (syncingRoute) return;
  const query: Record<string, string> = {};
  if (searchQuery.value.trim()) query.search = searchQuery.value.trim();
  if (language.value !== "all") query.language = language.value;
  if (activeTab.value !== "all") query.channel = activeTab.value;
  if (action.value !== "all") query.action = action.value;
  if (lifecycle.value !== "active") query.lifecycle = lifecycle.value;
  if (page.value > 1) query.page = String(page.value);
  if (sortBy.value !== "conversation_id") query.sortBy = sortBy.value;
  if (sortDirection.value !== "asc") query.sortDirection = sortDirection.value;
  void router.replace({ name: "conversations", query });
});
watch(() => route.query, (query) => {
  if (route.name !== "conversations") return;
  syncingRoute = true;
  const nextLanguage = queryValue(query.language);
  const nextTab = queryValue(query.channel);
  searchQuery.value = queryValue(query.search);
  language.value = validLanguage(nextLanguage) ? nextLanguage : "all";
  activeTab.value = validTab(nextTab) ? nextTab : "all";
  const nextAction = queryValue(query.action); action.value = validAction(nextAction) ? nextAction : "all";
  lifecycle.value = ["archived", "deleted"].includes(queryValue(query.lifecycle)) ? queryValue(query.lifecycle) as "archived" | "deleted" : "active";
  page.value = Math.max(1, Number.parseInt(queryValue(query.page), 10) || 1);
  const nextSort = queryValue(query.sortBy); sortBy.value = validSort(nextSort) ? nextSort : "conversation_id";
  sortDirection.value = queryValue(query.sortDirection) === "desc" ? "desc" : "asc";
  queueMicrotask(() => { syncingRoute = false; });
});

const matchingFilters = computed(() => {
  const params = new URLSearchParams();
  if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
  if (language.value !== "all") params.set("language", language.value);
  if (activeTab.value !== "all") params.set("channel", activeTab.value);
  if (action.value !== "all") params.set("action", action.value);
  params.set("lifecycle", lifecycle.value);
  return Object.fromEntries(params.entries());
});
const listPath = computed(() => `/v1/conversations?${new URLSearchParams({ ...matchingFilters.value, page: String(page.value), pageSize: "20", sortBy: sortBy.value, sortDirection: sortDirection.value })}`);
const conversationsQuery = useQuery({
  queryKey: computed(() => ["conversations", listPath.value]),
  queryFn: ({ signal }) => apiGet<ConversationListResponse>(listPath.value, signal),
  placeholderData: (previous) => previous,
  retry: 1,
  refetchInterval: (query) => query.state.data?.items.some((item) => ["queued", "processing", "waiting"].includes(item.evaluation_status ?? "")) ? 2500 : false
});
const conversationsErrorTitle = computed(() => {
  const error = conversationsQuery.error.value;
  if (error instanceof ApiError && (error.kind === "network" || error.kind === "timeout")) return "Network failure";
  return "API failure";
});
const conversations = computed<Conversation[]>(() => (conversationsQuery.data.value?.items ?? []).map((item) => ({
  dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id,
  language: item.normalized_language, channel: item.normalized_channel,
  message_count: item.message_count, duration_ms: item.duration_ms, has_audio: item.has_audio,
  quality_score: item.quality_score, recommended_action: item.recommended_action, classification_source: item.classification_source, classification_status: item.classification_status,
  evaluation_status: item.evaluation_status, critical_flag: item.critical_flag, score_reviewed: item.score_reviewed
})));
const totalConversations = computed(() => conversationsQuery.data.value?.pagination.total ?? 0);
const activeFilterCount = computed(() => [
  Boolean(searchQuery.value.trim()),
  language.value !== "all",
  activeTab.value !== "all",
  action.value !== "all"
].filter(Boolean).length);
const lifecycleLabel = computed(() => ({ active: "Active queue", archived: "Archive", deleted: "Deleted items" })[lifecycle.value]);

const selectionMode = ref(false);
const selected = ref(new Map<string, ConversationIdentity>());
const allMatching = ref(false);
const resolvingSelection = ref(false);
const pendingAction = ref<LifecycleAction | null>(null);
const pendingSelection = ref<ExportSelection>({ conversations: [] });
const pendingCount = ref(0);
const actionDialogOpen = ref(false);
const feedback = ref("");
const feedbackFailed = ref(false);
const exportSelection = ref<ExportSelection | null>(null);
const exportFilename = ref("cqa-conversations.json");
const evaluationSelection = ref<ExportSelection | null>(null);
const selectedKeys = computed(() => [...selected.value.keys()]);
const selectionCount = computed(() => allMatching.value ? conversationsQuery.data.value?.pagination.total ?? 0 : selected.value.size);
const selection = (): ExportSelection => allMatching.value ? { matching: { ...matchingFilters.value } } : { conversations: [...selected.value.values()] };
watch(matchingFilters, () => clearSelection());
onBeforeRouteLeave(() => { clearSelection(); });
async function materializeSelection(): Promise<boolean> {
  if (!allMatching.value) return true;
  resolvingSelection.value = true;
  try { selected.value = new Map((await resolveConversationSelection(selection())).map((item) => [conversationKey(item), item])); allMatching.value = false; return true; }
  catch (cause) { feedback.value = cause instanceof Error ? cause.message : "Could not update selection."; feedbackFailed.value = true; return false; }
  finally { resolvingSelection.value = false; }
}
async function toggleSelection(item: Conversation): Promise<void> {
  if (!await materializeSelection()) return;
  const next = new Map(selected.value); const key = conversationKey(item);
  next.has(key) ? next.delete(key) : next.set(key, { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }); selected.value = next;
}
async function togglePage(): Promise<void> {
  if (!await materializeSelection()) return;
  const next = new Map(selected.value); const remove = conversations.value.every((item) => next.has(conversationKey(item)));
  for (const item of conversations.value) { const key = conversationKey(item); if (remove) next.delete(key); else next.set(key, { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }); }
  selected.value = next;
}
function selectItem(item: Conversation): void { selectionMode.value = true; selected.value = new Map([...selected.value, [conversationKey(item), { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }]]); }
function clearSelection(): void { selected.value = new Map(); allMatching.value = false; selectionMode.value = false; }
function sort(key: ConversationSortKey): void { if (sortBy.value === key) sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc"; else { sortBy.value = key; sortDirection.value = "asc"; } page.value = 1; }
function openExport(item?: Conversation): void { exportSelection.value = item ? { conversations: [{ dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }] } : selection(); exportFilename.value = item ? `cqa-${item.conversation_id}.json` : "cqa-conversations.json"; }
function openAction(nextAction: LifecycleAction, item?: Conversation): void {
  pendingSelection.value = item ? { conversations: [{ dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }] } : selection();
  pendingCount.value = item ? 1 : selectionCount.value;
  lifecycleMutation.reset();
  pendingAction.value = nextAction; actionDialogOpen.value = true;
}
const lifecycleMutation = useMutation({
  mutationFn: () => {
    return mutateConversationLifecycle({ action: pendingAction.value!, ...pendingSelection.value });
  },
  onSuccess: async (result) => {
    feedback.value = result.failed.length ? `${result.succeeded} updated; ${result.failed.length} failed: ${result.failed.map((item) => item.conversation_id).join(", ")}.` : `${result.succeeded} conversation${result.succeeded === 1 ? "" : "s"} updated.`;
    feedbackFailed.value = result.failed.length > 0;
    actionDialogOpen.value = false; clearSelection();
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    const totalPages = conversationsQuery.data.value?.pagination.totalPages ?? 0; if (page.value > Math.max(1, totalPages)) page.value = Math.max(1, totalPages);
  }
});

const upload = useMutation({
  mutationFn: (file: File) => apiUpload<{ import_id: string }>("/v1/datasets/import", file),
  onSuccess: (response) => { importId.value = response.import_id; }
});
const importStatus = useQuery({
  queryKey: computed(() => ["import", importId.value]),
  enabled: computed(() => Boolean(importId.value)),
  queryFn: ({ signal }) => apiGet<ImportStatus>(`/v1/imports/${importId.value}`, signal),
  refetchInterval: (query) => ["completed", "failed"].includes(query.state.data?.status ?? "") ? false : 750
});
watch(() => importStatus.data.value?.status, (status) => {
  if (status === "completed") void queryClient.invalidateQueries({ queryKey: ["conversations"] });
});
function closeDialog() {
  dialogOpen.value = false;
  if (["completed", "failed"].includes(importStatus.data.value?.status ?? "")) importId.value = undefined;
  upload.reset();
}
function batchStarted(batch: EvaluationBatch) {
  if (dismissedBatchIds().has(batch.batch_id)) return;
  activeBatchId.value = batch.batch_id;
  window.localStorage.setItem("cqa-active-batch-id", batch.batch_id);
}
function dismissBatch() {
  try { const ids = new Set(JSON.parse(window.sessionStorage.getItem("cqa-dismissed-batches") ?? "[]") as string[]); ids.add(activeBatchId.value); window.sessionStorage.setItem("cqa-dismissed-batches", JSON.stringify([...ids])); } catch { /* Session storage can be unavailable. */ }
  activeBatchId.value = "";
  window.localStorage.removeItem("cqa-active-batch-id");
}
function clearFilters() {
  setFilters(["", "all", "all", "all", "active"]);
}
</script>

<template>
  <section aria-labelledby="conversations-title" class="relative mx-auto w-full max-w-[100rem]">
    <header class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 id="conversations-title" class="text-2xl font-bold tracking-tight text-ink">Conversations</h1><p class="text-xs text-muted">{{ totalConversations }} in {{ lifecycleLabel.toLowerCase() }}</p></div>
      <div class="flex flex-wrap items-center gap-2"><BatchEvaluationButton @click="batchDialogOpen = true" /><ImportConversationsButton @click="dialogOpen = true" /><ConversationMenu label="Conversation page actions" :items="[{ id: 'select', label: 'Select conversations' }]" @select="selectionMode = true" /></div>
    </header>
    <BatchProgress v-if="activeBatchId" :batch-id="activeBatchId" @dismiss="dismissBatch" />
    <div class="overflow-hidden rounded-lg border border-line bg-white">
      <div class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3">
        <ConversationTabs v-model="activeTab" />
        <div class="min-w-40 flex-1"><ConversationSearch v-model="searchQuery" /></div>
        <ConversationFilters v-model:language="language" />
        <select id="conversation-action" v-model="action" class="h-10 w-full rounded-md border border-line bg-white px-2 text-xs text-ink sm:w-48" aria-label="Filter by recommended action"><option value="all">All recommended actions</option><option v-for="code in ACTION_CODES" :key="code" :value="code">{{ ACTION_LABELS[code] }}</option></select>
        <select v-model="lifecycle" class="h-10 rounded-md border border-line bg-white px-2 text-xs font-medium text-ink" aria-label="Conversation lifecycle view"><option value="active">Active queue</option><option value="archived">Archived</option><option value="deleted">Deleted items</option></select>
        <button v-if="activeFilterCount" type="button" class="min-h-9 rounded-md px-2 text-xs font-semibold text-muted hover:bg-surface" @click="clearFilters">Clear {{ activeFilterCount }} filters</button>
      </div>
      <ConversationSelectionToolbar v-if="selectionMode" :count="selected.size" :total="totalConversations" :all-matching="allMatching" :lifecycle="lifecycle" :pending="lifecycleMutation.isPending.value || resolvingSelection" @clear="clearSelection" @all-matching="allMatching = true" @archive="openAction('archive')" @unarchive="openAction('unarchive')" @delete="openAction('delete')" @restore="openAction('restore')" @evaluate="evaluationSelection = selection()" @export="openExport()" />
      <div v-if="feedback" class="flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-xs" :class="feedbackFailed ? 'text-amber-800' : 'text-emerald-700'" role="status"><p>{{ feedback }}</p><button type="button" class="rounded p-1 hover:bg-surface" aria-label="Dismiss conversation update" @click="feedback = ''"><X :size="14" /></button></div>
      <ConversationList :conversations="conversations" :has-active-filters="Boolean(activeFilterCount)" :loading="conversationsQuery.isLoading.value && !conversationsQuery.isError.value" :error="conversationsQuery.error.value?.message" :error-title="conversationsErrorTitle" :selected-keys="selectedKeys" :lifecycle="lifecycle" :selection-mode="selectionMode" :all-matching="allMatching" :busy="resolvingSelection || lifecycleMutation.isPending.value" :sort-by="sortBy" :sort-direction="sortDirection" @clear-filters="clearFilters" @import="dialogOpen = true" @retry="conversationsQuery.refetch()" @toggle="toggleSelection" @toggle-page="togglePage" @select="selectItem" @action="openAction" @export="openExport" @sort="sort" />
      <ConversationPagination :page="page" :total-pages="conversationsQuery.data.value?.pagination.totalPages ?? 0" :total="totalConversations" @change="page = $event" />
    </div>
    <ImportDialog :open="dialogOpen" :pending="upload.isPending.value" :status="importStatus.data.value" :error="upload.error.value?.message" @close="closeDialog" @import="upload.mutate" />
    <BatchEvaluationDialog :open="batchDialogOpen" @close="batchDialogOpen = false" @started="batchStarted" />
    <ConversationActionDialog :open="actionDialogOpen" :action="pendingAction ?? 'archive'" :count="pendingCount" :pending="lifecycleMutation.isPending.value" :error="lifecycleMutation.error.value?.message" @close="actionDialogOpen = false" @confirm="lifecycleMutation.mutate()" />
    <ExportResultsDialog v-if="exportSelection" :selection="exportSelection" :filename="exportFilename" @close="exportSelection = null" @exported="feedback = 'Evaluation JSON exported.'; feedbackFailed = false" />
    <BulkEvaluationDialog v-if="evaluationSelection" :selection="evaluationSelection" @close="evaluationSelection = null" @updated="conversationsQuery.refetch()" />
  </section>
</template>
