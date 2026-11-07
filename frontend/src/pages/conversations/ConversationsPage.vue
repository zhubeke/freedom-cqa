<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import ConversationFilters from "../../components/ConversationFilters/ConversationFilters.vue";
import ConversationList from "../../components/ConversationList/ConversationList.vue";
import ConversationSearch from "../../components/ConversationSearch/ConversationSearch.vue";
import ConversationTabs from "../../components/ConversationTabs/ConversationTabs.vue";
import ConversationPagination from "../../components/ConversationPagination/ConversationPagination.vue";
import ImportConversationsButton from "../../components/ImportConversationsButton/ImportConversationsButton.vue";
import ImportDialog from "../../components/ImportDialog/ImportDialog.vue";
import { visualAssets } from "../../assets";
import { apiGet, apiUpload } from "../../api/client";
import type {
  Conversation,
  ConversationListResponse,
  ConversationLanguage,
  ConversationTab,
  ImportStatus
} from "../../shared/types/conversation";

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
const page = ref(Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1));
const dialogOpen = ref(false);
const importId = ref<string>();
const queryClient = useQueryClient();
let syncingRoute = false;
watch([searchQuery, language, activeTab], () => {
  if (!syncingRoute) page.value = 1;
});
watch([searchQuery, language, activeTab, page], () => {
  if (syncingRoute) return;
  const query: Record<string, string> = {};
  if (searchQuery.value.trim()) query.search = searchQuery.value.trim();
  if (language.value !== "all") query.language = language.value;
  if (activeTab.value !== "all") query.channel = activeTab.value;
  if (page.value > 1) query.page = String(page.value);
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
  page.value = Math.max(1, Number.parseInt(queryValue(query.page), 10) || 1);
  queueMicrotask(() => { syncingRoute = false; });
});

const listPath = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: "20" });
  if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
  if (language.value !== "all") params.set("language", language.value);
  if (activeTab.value !== "all") params.set("channel", activeTab.value);
  return `/v1/conversations?${params}`;
});
const conversationsQuery = useQuery({
  queryKey: computed(() => ["conversations", listPath.value]),
  queryFn: ({ signal }) => apiGet<ConversationListResponse>(listPath.value, signal),
  placeholderData: (previous) => previous
});
const conversations = computed<Conversation[]>(() => (conversationsQuery.data.value?.items ?? []).map((item) => ({
  dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id,
  language: item.normalized_language, channel: item.normalized_channel,
  message_count: item.message_count, duration_ms: item.duration_ms, has_audio: item.has_audio
})));

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
</script>

<template>
  <section aria-labelledby="conversations-title" class="relative">
    <div class="relative mb-7 overflow-hidden rounded-[1.75rem] bg-white px-5 py-6 sm:mb-8 sm:px-8 sm:py-8">
      <img :src="visualAssets.images.conversationPattern" alt="" class="pointer-events-none absolute -right-5 top-0 hidden h-full w-auto sm:block" />
      <div class="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div>
        <p class="mb-2 text-sm font-semibold text-primary">Quality workspace</p>
        <h1 id="conversations-title" class="text-3xl font-bold tracking-[-0.025em] text-ink sm:text-[2.5rem] sm:leading-tight">
        Conversations
        </h1>
        <p class="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
          Find, review, and evaluate customer interactions in one focused workspace.
        </p>
        </div>
        <ImportConversationsButton @click="dialogOpen = true" />
      </div>
    </div>

    <div class="overflow-hidden rounded-[1.75rem] bg-white">
      <div class="border-b border-line px-4 py-4 sm:px-6 sm:py-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ConversationTabs v-model="activeTab" />
          <div class="w-full lg:max-w-md">
            <ConversationSearch v-model="searchQuery" />
          </div>
        </div>
        <div class="mt-4">
          <ConversationFilters v-model:language="language" />
        </div>
      </div>

      <ConversationList
        :conversations="conversations"
        :has-active-filters="Boolean(searchQuery || language !== 'all' || activeTab !== 'all')"
        :loading="conversationsQuery.isLoading.value || conversationsQuery.isFetching.value"
        :error="conversationsQuery.error.value?.message"
      />
      <ConversationPagination
        :page="page"
        :total-pages="conversationsQuery.data.value?.pagination.totalPages ?? 0"
        :total="conversationsQuery.data.value?.pagination.total ?? 0"
        @change="page = $event"
      />
    </div>
    <ImportDialog
      :open="dialogOpen"
      :pending="upload.isPending.value"
      :status="importStatus.data.value"
      :error="upload.error.value?.message"
      @close="closeDialog"
      @import="upload.mutate"
    />
  </section>
</template>
