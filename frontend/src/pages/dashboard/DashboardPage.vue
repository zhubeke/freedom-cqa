<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import * as echarts from "echarts";
import { AlertCircle, ArrowRight, LoaderCircle, RotateCw } from "lucide-vue-next";
import AnalysisViewToggle from "../../components/AnalysisViewToggle/AnalysisViewToggle.vue";
import { useAnalysisView } from "../../shared/use-analysis-view";
import { getDashboard } from "../../api/analytics";
import { ACTION_CODES, ACTION_LABELS } from "../../shared/types/action";

const mode = useAnalysisView("cqa-dashboard-analysis-view");
const dataset = ref("");
const channel = ref("");
const language = ref("");
const action = ref("");
const scoreElement = ref<HTMLElement>();
const actionElement = ref<HTMLElement>();
let scoreChart: echarts.ECharts | null = null;
let actionChart: echarts.ECharts | null = null;
let chartObserver: ResizeObserver | null = null;
const params = computed(() => {
  const result = new URLSearchParams();
  if (dataset.value.trim()) result.set("datasetGroupId", dataset.value.trim());
  if (channel.value) result.set("channel", channel.value);
  if (language.value) result.set("language", language.value);
  if (action.value) result.set("action", action.value);
  return result;
});
const query = useQuery({
  queryKey: computed(() => ["analytics", params.value.toString()]),
  queryFn: ({ signal }) => getDashboard(params.value, signal)
});
const data = computed(() => query.data.value);
const hasFilters = computed(() => Boolean(params.value.size));
const number = (value: number) => value.toLocaleString();
const actionLabel = (code: string) => code === "UNCLASSIFIED" ? "No recommendation yet" : ACTION_LABELS[code as keyof typeof ACTION_LABELS] ?? code;
const languageLabel = (code: string) => ({ en: "English", ru: "Russian", kk: "Kazakh" })[code] ?? code;
const channelLabel = (code: string) => ({ chat: "Chat", call: "Voice call" })[code] ?? code;
const statusLabel = (status: string) => ({ queued: "Queued", waiting: "Waiting", processing: "In progress", completed: "Completed", failed: "Failed", cancelled: "Cancelled" })[status] ?? status.replaceAll("_", " ");
const actionRows = computed(() => Object.entries(data.value?.actions ?? {})
  .map(([code, count]) => ({ code, label: actionLabel(code), count }))
  .sort((a, b) => b.count - a.count));
const evaluatedPercent = computed(() => data.value?.totals.conversations ? Math.round(data.value.totals.analyzed / data.value.totals.conversations * 100) : 0);
const unevaluated = computed(() => Math.max(0, (data.value?.totals.conversations ?? 0) - (data.value?.totals.analyzed ?? 0)));
const responseTime = computed(() => {
  const milliseconds = data.value?.totals.average_operator_response_ms;
  if (milliseconds == null) return "—";
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
});
const cards = computed(() => data.value ? [
  { label: "Conversations", value: number(data.value.totals.conversations), detail: hasFilters.value ? "Matching these filters" : "Across all groups", warning: false },
  { label: "Evaluated", value: number(data.value.totals.analyzed), detail: `${evaluatedPercent.value}% of conversations`, warning: false },
  { label: "Average quality score", value: data.value.totals.average_score === null ? "—" : `${data.value.totals.average_score}`, detail: "Out of 100 · completed evaluations", warning: false },
  { label: "Severe violations", value: number(data.value.totals.severe_violations), detail: "Conversations with a serious issue", warning: data.value.totals.severe_violations > 0 }
] : []);
function clearFilters() { dataset.value = ""; channel.value = ""; language.value = ""; action.value = ""; }
function disposeCharts() {
  chartObserver?.disconnect(); chartObserver = null;
  scoreChart?.dispose(); actionChart?.dispose();
  scoreChart = null; actionChart = null;
}
watch([data, scoreElement, actionElement], async () => {
  await nextTick();
  disposeCharts();
  if (!data.value) return;
  if (scoreElement.value) {
    scoreChart = echarts.init(scoreElement.value);
    scoreChart.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 20, bottom: 30, left: 40, right: 15 },
      xAxis: { type: "category", data: data.value.score_distribution.map(item => item.label), axisLine: { lineStyle: { color: "#e6e8eb" } }, axisLabel: { color: "#747b86" }, axisTick: { show: false } },
      yAxis: { type: "value", minInterval: 1, axisLabel: { color: "#747b86" }, splitLine: { lineStyle: { color: "#f0f1f3" } } },
      series: [{ name: "Conversations", type: "bar", barMaxWidth: 55, data: data.value.score_distribution.map(item => item.count), itemStyle: { color: "#f14646", borderRadius: [4, 4, 0, 0] } }]
    });
  }
  if (actionElement.value) {
    actionChart = echarts.init(actionElement.value);
    actionChart.setOption({
      color: ["#567d6e", "#f14646", "#d19a49", "#6587a8", "#9884ab", "#93a283", "#bd7e72", "#a6abb2", "#dadde1"],
      tooltip: { trigger: "item" },
      series: [{ type: "pie", radius: ["45%", "72%"], label: { show: false }, data: actionRows.value.map(row => ({ name: row.label, value: row.count })) }]
    });
  }
  chartObserver = new ResizeObserver(() => { scoreChart?.resize(); actionChart?.resize(); });
  if (scoreElement.value) chartObserver.observe(scoreElement.value);
  if (actionElement.value) chartObserver.observe(actionElement.value);
}, { flush: "post" });
onBeforeUnmount(disposeCharts);
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p class="mt-1 text-sm text-muted">Quality results and follow-up across your conversations.</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <AnalysisViewToggle v-model="mode" />
        <button class="button-secondary" :disabled="query.isFetching.value" @click="query.refetch()">
          <RotateCw :size="16" :class="{ 'animate-spin': query.isFetching.value }" /> Refresh
        </button>
      </div>
    </div>
    <div class="rounded-xl border border-line bg-white p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="space-y-1.5 text-xs font-medium text-muted">Dataset group
          <input v-model.lazy="dataset" class="field" placeholder="All groups" />
        </label>
        <label class="space-y-1.5 text-xs font-medium text-muted">Channel
          <select v-model="channel" class="field"><option value="">All channels</option><option value="chat">Chat</option><option value="call">Voice call</option></select>
        </label>
        <label class="space-y-1.5 text-xs font-medium text-muted">Language
          <select v-model="language" class="field"><option value="">All languages</option><option value="ru">Russian</option><option value="kk">Kazakh</option><option value="en">English</option></select>
        </label>
        <label class="space-y-1.5 text-xs font-medium text-muted">Recommended follow-up
          <select v-model="action" class="field"><option value="">All recommendations</option><option v-for="code in ACTION_CODES" :key="code" :value="code">{{ ACTION_LABELS[code] }}</option></select>
        </label>
      </div>
      <div v-if="hasFilters" class="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
        <span>Showing results that match these filters.</span>
        <button class="font-medium text-ink underline underline-offset-4" @click="clearFilters">Clear filters</button>
      </div>
    </div>
    <div v-if="query.isLoading.value" class="flex justify-center gap-2 rounded-xl border border-line bg-white p-12 text-sm text-muted" role="status"><LoaderCircle :size="18" class="animate-spin" /> Loading results…</div>
    <div v-else-if="query.isError.value" class="rounded-xl border border-line bg-white p-10 text-center" role="alert">
      <AlertCircle class="mx-auto text-muted" />
      <p class="mt-3 font-semibold">Couldn’t load the dashboard</p>
      <p class="mt-1 text-sm text-muted">{{ query.error.value?.message }}</p>
      <button class="button-secondary mt-4" @click="query.refetch()"><RotateCw :size="16" /> Try again</button>
    </div>
    <template v-else-if="data">
      <div v-if="!data.totals.conversations" class="rounded-xl border border-line bg-white p-12 text-center">
        <p class="font-semibold">No conversations found</p>
        <p class="mt-2 text-sm text-muted">{{ hasFilters ? 'Try a different group or clear the filters.' : 'Import conversations to see quality results here.' }}</p>
        <button v-if="hasFilters" class="button-secondary mt-4" @click="clearFilters">Clear filters</button>
        <RouterLink v-else class="button-secondary mt-4" to="/conversations">Go to conversations <ArrowRight :size="16" /></RouterLink>
      </div>
      <template v-else>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="card in cards" :key="card.label" class="rounded-xl border border-line bg-white p-5">
            <p class="text-sm text-muted">{{ card.label }}</p>
            <p class="mt-2 text-3xl font-semibold tabular-nums" :class="card.warning ? 'text-amber-700' : 'text-ink'">{{ card.value }}</p>
            <p class="mt-2 text-xs text-muted">{{ card.detail }}</p>
          </div>
        </div>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Recommended follow-up</h2>
            <p class="mt-1 text-xs text-muted">The latest recommendation for each conversation.</p>
            <div v-if="mode === 'advanced'" ref="actionElement" class="h-56" role="img" aria-label="Recommended follow-up distribution. Counts are listed below." />
            <ul class="mt-4 divide-y divide-line">
              <li v-for="row in actionRows" :key="row.code" class="flex items-center justify-between gap-4 py-3 text-sm">
                <span :class="row.code === 'UNCLASSIFIED' ? 'text-muted' : ''">{{ row.label }}</span>
                <span class="font-semibold tabular-nums">{{ number(row.count) }}</span>
              </li>
            </ul>
          </div>
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Open work</h2>
            <div class="mt-4 divide-y divide-line">
              <div class="flex items-center justify-between gap-4 py-3 text-sm"><span>Without a completed evaluation</span><strong class="tabular-nums">{{ number(unevaluated) }}</strong></div>
              <div class="flex items-center justify-between gap-4 py-3 text-sm"><span>Appeals to review</span><strong class="tabular-nums">{{ number(data.appeals.pending) }}</strong></div>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <RouterLink to="/conversations" class="button-secondary">Conversations <ArrowRight :size="15" /></RouterLink>
              <RouterLink v-if="data.appeals.pending" to="/reviews" class="button-secondary">Review appeals <ArrowRight :size="15" /></RouterLink>
            </div>
            <p v-if="mode === 'simple'" class="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">Advanced view includes score distribution, resolution, response times, and processing details.</p>
          </div>
        </div>
        <div v-if="mode === 'advanced'" class="grid items-start gap-5 lg:grid-cols-2">
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Quality scores</h2>
            <p class="mt-1 text-xs text-muted">Latest completed evaluation for each conversation.</p>
            <div v-if="data.totals.analyzed" ref="scoreElement" class="mt-3 h-64" role="img" aria-label="Quality score distribution. Counts are listed below." />
            <p v-else class="py-8 text-sm text-muted">No completed evaluations yet.</p>
            <dl class="mt-3 grid grid-cols-5 gap-2 border-t border-line pt-4">
              <div v-for="bucket in data.score_distribution" :key="bucket.label" class="text-center"><dt class="text-xs text-muted">{{ bucket.label }}</dt><dd class="mt-1 text-sm font-semibold tabular-nums">{{ number(bucket.count) }}</dd></div>
            </dl>
          </div>
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Resolution and response time</h2>
            <dl class="mt-4 divide-y divide-line text-sm">
              <div class="flex justify-between gap-4 py-3"><dt>Resolved</dt><dd class="font-semibold tabular-nums">{{ number(data.resolution.resolved) }}</dd></div>
              <div class="flex justify-between gap-4 py-3"><dt>Unresolved</dt><dd class="font-semibold tabular-nums">{{ number(data.resolution.unresolved) }}</dd></div>
              <div class="flex justify-between gap-4 py-3"><dt>Average operator response</dt><dd class="font-semibold tabular-nums">{{ responseTime }}</dd></div>
            </dl>
            <p class="mt-3 text-xs text-muted">Resolution and response times are shown where analysis is available.</p>
          </div>
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Conversation breakdown</h2>
            <div class="mt-5 grid gap-6 sm:grid-cols-2">
              <div><h3 class="text-xs font-medium text-muted">Language</h3><dl class="mt-2 space-y-3"><div v-for="(count, code) in data.languages" :key="code" class="flex justify-between gap-3 text-sm"><dt>{{ languageLabel(code) }}</dt><dd class="font-semibold tabular-nums">{{ number(count) }}</dd></div></dl></div>
              <div><h3 class="text-xs font-medium text-muted">Channel</h3><dl class="mt-2 space-y-3"><div v-for="(count, code) in data.channels" :key="code" class="flex justify-between gap-3 text-sm"><dt>{{ channelLabel(code) }}</dt><dd class="font-semibold tabular-nums">{{ number(count) }}</dd></div></dl></div>
            </div>
          </div>
          <div class="rounded-xl border border-line bg-white p-5">
            <h2 class="font-semibold">Review and processing</h2>
            <h3 class="mt-5 text-xs font-medium text-muted">Appeal decisions</h3>
            <dl class="mt-3 space-y-3 text-sm">
              <div class="flex justify-between gap-3"><dt>Original result kept</dt><dd class="font-semibold tabular-nums">{{ number(data.appeals.outcomes.CONFIRMED ?? 0) }}</dd></div>
              <div class="flex justify-between gap-3"><dt>Result changed</dt><dd class="font-semibold tabular-nums">{{ number(data.appeals.outcomes.OVERRIDDEN ?? 0) }}</dd></div>
            </dl>
            <h3 class="mt-6 border-t border-line pt-4 text-xs font-medium text-muted">Evaluation runs</h3>
            <dl v-if="Object.keys(data.processing).length" class="mt-3 space-y-3 text-sm"><div v-for="(count, status) in data.processing" :key="status" class="flex justify-between gap-3"><dt>{{ statusLabel(status) }}</dt><dd class="font-semibold tabular-nums">{{ number(count) }}</dd></div></dl>
            <p v-else class="mt-3 text-sm text-muted">No evaluation runs yet.</p>
            <p class="mt-4 text-xs text-muted">Includes previous runs of the same conversation.</p>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
