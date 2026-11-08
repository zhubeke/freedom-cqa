<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { LoaderCircle, Play, RotateCw, X } from "lucide-vue-next";
import { listChecklists } from "../../api/checklists";
import { resolveConversationSelection, type ConversationIdentity, type ConversationSelection } from "../../api/conversations";
import { getEvaluation, retryEvaluation, startEvaluation } from "../../api/evaluations";

const props = defineProps<{ selection: ConversationSelection }>();
const emit = defineEmits<{ close: []; updated: [] }>();
interface WorkItem extends ConversationIdentity { runId?: string; status: "pending" | "starting" | "queued" | "processing" | "waiting" | "completed" | "failed"; error?: string }
const items = ref<WorkItem[]>([]); const loading = ref(true); const working = ref(false); const started = ref(false); const error = ref(""); const pollError = ref(""); const checklistId = ref("");
const dialog = ref<HTMLElement>(); const previousFocus = document.activeElement as HTMLElement | null;
const client = useQueryClient(); const checklists = useQuery({ queryKey: ["checklists"], queryFn: ({ signal }) => listChecklists(signal) });
const activeChecklists = computed(() => (checklists.data.value ?? []).filter(item => item.is_active !== false && item.active_version_id));
const versionId = computed(() => activeChecklists.value.find((item) => item.id === checklistId.value)?.active_version_id ?? "");
watch(activeChecklists, (value) => { if (!value.some(item => item.id === checklistId.value)) checklistId.value = value?.find((item) => item.id === "freedom-default-checklist")?.id ?? value?.[0]?.id ?? ""; }, { immediate: true });
const completed = computed(() => items.value.filter((item) => item.status === "completed").length);
const failed = computed(() => items.value.filter((item) => item.status === "failed").length);
const running = computed(() => started.value && items.value.some((item) => !["completed", "failed"].includes(item.status)));
let timer: number | undefined; let polling = false; let mounted = true;
async function load() {
  loading.value = true; error.value = "";
  try { items.value = (await resolveConversationSelection(props.selection)).map((item) => ({ ...item, status: "pending" })); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not resolve the selection."; }
  finally { loading.value = false; }
}
async function refresh(item: WorkItem) {
  if (!item.runId) return;
  const run = await getEvaluation(item.runId);
  item.status = run.status; item.error = run.error ?? undefined;
}
async function poll() {
  if (polling || !mounted) return; polling = true;
  const active = items.value.filter((item) => item.runId && ["queued", "processing", "waiting"].includes(item.status));
  try {
    const results = await Promise.allSettled(active.map(refresh));
    pollError.value = results.some((result) => result.status === "rejected") ? "Progress could not be refreshed. Saved backend runs continue; retrying automatically." : "";
    if (active.some((item) => ["completed", "failed"].includes(item.status))) { emit("updated"); await client.invalidateQueries({ queryKey: ["conversations"] }); }
  } finally { polling = false; }
}
async function execute(retryOnly = false) {
  working.value = true; started.value = true; error.value = "";
  const queue = items.value.filter((item) => retryOnly ? item.status === "failed" : item.status === "pending");
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    let item: WorkItem | undefined;
    while ((item = queue.shift())) {
      item.status = "starting"; item.error = undefined;
      try {
        if (retryOnly && item.runId) {
          const saved = await getEvaluation(item.runId);
          item.status = saved.status; item.error = saved.error ?? undefined;
          if (saved.status !== "failed") continue;
          await retryEvaluation(item.runId); item.status = "queued";
        }
        else { const response = await startEvaluation(item.conversation_id, versionId.value, item.dataset_group_id); item.runId = response.evaluation_run_id; item.status = response.status; }
        try { await refresh(item); }
        catch { pollError.value = "Progress could not be refreshed. Saved backend runs continue; retrying automatically."; }
      } catch (cause) { item.status = "failed"; item.error = cause instanceof Error ? cause.message : "Evaluation could not be started."; }
    }
  }));
  working.value = false; emit("updated"); await client.invalidateQueries({ queryKey: ["conversations"] });
}
function close() { if (!working.value) emit("close"); }
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); }
  if (event.key !== "Tab") return;
  const buttons = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])];
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
}
onMounted(async () => { dialog.value?.focus(); await load(); checklistId.value = checklists.data.value?.find((item) => item.id === "freedom-default-checklist")?.id ?? checklists.data.value?.[0]?.id ?? ""; timer = window.setInterval(() => { void poll(); }, 2000); });
onBeforeUnmount(() => { mounted = false; window.clearInterval(timer); previousFocus?.focus({ preventScroll: true }); });
</script>

<template>
  <Teleport to="body"><div class="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" @click.self="close" @keydown="keyboard"><section ref="dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="bulk-evaluation-title" class="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-lg">
    <div class="flex items-center justify-between gap-3"><h2 id="bulk-evaluation-title" class="text-lg font-bold">Evaluate selected conversations</h2><button type="button" class="icon-button" aria-label="Close evaluation dialog" :disabled="working" @click="close"><X :size="18" /></button></div>
    <p v-if="loading" class="mt-4 flex items-center gap-2 text-sm text-muted" role="status"><LoaderCircle :size="16" class="animate-spin" /> Resolving selected conversations…</p>
    <template v-else>
      <p class="mt-2 text-sm text-muted">{{ items.length }} conversation(s) selected. Each evaluation uses the checklist chosen below.</p>
      <label class="mt-4 block text-xs font-semibold">Checklist<select v-model="checklistId" class="mt-1 min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-normal" :disabled="started"><option value="" disabled>Choose a checklist</option><option v-for="checklist in activeChecklists" :key="checklist.id" :value="checklist.id">{{ checklist.name }}</option></select></label>
      <p v-if="checklists.isError.value" class="mt-2 text-sm text-red-700">{{ checklists.error.value?.message }}</p>
      <div v-if="started" class="mt-4" role="status" aria-live="polite"><p class="text-sm font-semibold">{{ completed }} of {{ items.length }} completed<span v-if="failed"> · {{ failed }} failed</span></p><div class="mt-2 h-1.5 rounded bg-surface" role="progressbar" :aria-valuenow="completed" :aria-valuemin="0" :aria-valuemax="items.length" aria-label="Completed evaluations"><div class="h-full rounded bg-emerald-600" :style="{ width: `${items.length ? completed / items.length * 100 : 0}%` }" /></div><p v-if="running" class="mt-2 text-xs text-muted">Saved evaluations continue if this dialog is closed.</p></div>
      <ul v-if="started" class="mt-3 max-h-56 divide-y divide-line overflow-y-auto text-xs"><li v-for="(item, index) in items" :key="index" class="py-2"><div class="flex justify-between gap-3"><strong>{{ item.conversation_id }}</strong><span :class="item.status === 'failed' ? 'text-red-700' : item.status === 'completed' ? 'text-emerald-700' : 'text-muted'">{{ item.status }}</span></div><p v-if="item.error" class="mt-1 text-red-700">{{ item.error }}</p></li></ul>
    </template>
    <p v-if="error || pollError" class="mt-3 text-sm text-red-700" role="alert">{{ error || pollError }}</p>
    <div class="mt-5 flex flex-wrap justify-end gap-2"><button type="button" class="button-secondary !min-h-9 !rounded-md" :disabled="working" @click="close">{{ started ? 'Close' : 'Cancel' }}</button><button v-if="error && !started" type="button" class="button-secondary !min-h-9 !rounded-md" @click="load">Retry selection</button><button v-if="failed" type="button" class="button-secondary !min-h-9 !rounded-md" :disabled="working" @click="execute(true)"><RotateCw :size="15" /> Retry failed {{ failed }}</button><button v-if="!started" type="button" class="button-primary !min-h-9 !rounded-md" :disabled="loading || !items.length || !versionId || working || Boolean(error)" @click="execute()"><Play :size="15" /> Evaluate {{ items.length }}</button></div>
  </section></div></Teleport>
</template>
