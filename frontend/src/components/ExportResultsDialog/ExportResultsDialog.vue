<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Download, LoaderCircle, X } from "lucide-vue-next";
import { downloadExport, previewExport, type ExportPreview, type ExportSelection } from "../../api/exports";
const props = withDefaults(defineProps<{ selection: ExportSelection; filename?: string }>(), { filename: "cqa-conversations.json" });
const emit = defineEmits<{ close: []; exported: [] }>();
const preview = ref<ExportPreview | null>(null);
const error = ref("");
const loading = ref(true);
const downloading = ref(false);
const dialog = ref<HTMLElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
async function load() {
  loading.value = true; error.value = "";
  try { preview.value = await previewExport(props.selection); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not validate the selected evaluations."; }
  finally { loading.value = false; }
}
async function download(excludeUnavailable = false) {
  downloading.value = true; error.value = "";
  try {
    await downloadExport(excludeUnavailable ? { conversations: preview.value!.eligible } : props.selection, props.filename);
    emit("exported"); emit("close");
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Export failed. Please retry."; }
  finally { downloading.value = false; }
}
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape" && !downloading.value) emit("close");
  if (event.key !== "Tab" || !dialog.value) return;
  const items = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')];
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(() => { dialog.value?.focus(); void load(); });
onBeforeUnmount(() => previousFocus?.focus({ preventScroll: true }));
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" @click.self="!downloading && emit('close')" @keydown="keyboard">
      <section ref="dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="export-title" class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-lg">
        <div class="flex items-center justify-between gap-3"><h2 id="export-title" class="text-lg font-bold">Export evaluation JSON</h2><button type="button" class="icon-button" aria-label="Close export" :disabled="downloading" @click="emit('close')"><X :size="18" /></button></div>
        <p class="mt-2 text-sm text-muted">Exports schema 1.0 with verified evidence and the latest finalized review, when available.</p>
        <p v-if="loading" role="status" class="mt-5 flex items-center gap-2 text-sm text-muted"><LoaderCircle :size="17" class="animate-spin" /> Checking selected conversations…</p>
        <div v-else-if="preview" class="mt-4 space-y-3 text-sm">
          <p><strong>{{ preview.eligible.length }}</strong> conversation(s) ready to export.</p>
          <p v-if="!preview.configured" role="alert" class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">Set CQA_TEAM_NAME in the application configuration before exporting.</p>
          <div v-if="preview.model_conflict" role="alert" class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900"><p>These conversations use different models. Select conversations from one model for each export.</p><ul class="mt-2 list-disc pl-4"><li v-for="model in preview.models" :key="`${model.mode}:${model.name}`">{{ model.name }} ({{ model.mode }})</li></ul></div>
          <div v-if="preview.issues.length" class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900"><p class="font-semibold">{{ preview.issues.length }} selected conversation(s) cannot be exported.</p><ul class="mt-2 max-h-48 space-y-1 overflow-y-auto"><li v-for="(issue, index) in preview.issues" :key="index"><strong>{{ issue.conversation_id }}</strong>: {{ issue.error }}</li></ul><p class="mt-2">Exporting eligible conversations explicitly excludes the records listed above.</p></div>
        </div>
        <p v-if="error" role="alert" class="mt-4 text-sm text-red-700">{{ error }}</p>
        <div class="mt-5 flex flex-wrap justify-end gap-2"><button type="button" class="button-secondary !min-h-9 !rounded-md" :disabled="downloading" @click="emit('close')">Cancel</button><button v-if="!preview && !loading" type="button" class="button-secondary !min-h-9 !rounded-md" @click="load">Retry validation</button><button v-if="preview" type="button" class="button-primary !min-h-9 !rounded-md" :disabled="downloading || !preview.configured || preview.model_conflict || !preview.eligible.length" @click="download(preview.issues.length > 0)"><LoaderCircle v-if="downloading" :size="16" class="animate-spin" /><Download v-else :size="16" />{{ preview.issues.length ? `Export eligible ${preview.eligible.length}` : 'Download JSON' }}</button></div>
      </section>
    </div>
  </Teleport>
</template>
