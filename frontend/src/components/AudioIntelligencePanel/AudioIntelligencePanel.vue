<script setup lang="ts">
import { computed, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Activity, AlertTriangle, Headphones, RefreshCw } from "lucide-vue-next";
import { audioKeys, audioPlaybackUrl, getAudioAnalysis, startAudioAnalysis } from "../../api/audio";
import AudioMetricsOverview from "../AudioMetricsOverview/AudioMetricsOverview.vue";
import SpeakerMetrics from "../SpeakerMetrics/SpeakerMetrics.vue";
import SpeakerTimeline from "../SpeakerTimeline/SpeakerTimeline.vue";
import AudioCharts from "./AudioCharts.vue";

const props=defineProps<{ conversationId:string; datasetGroupId:string; hasAudio:boolean }>();
const client=useQueryClient(); const force=ref(false); const player=ref<HTMLAudioElement>();
const query=useQuery({
  queryKey: computed(()=>audioKeys.detail(props.conversationId,props.datasetGroupId)),
  queryFn:({signal})=>getAudioAnalysis(props.conversationId,props.datasetGroupId,signal),
  enabled:computed(()=>props.hasAudio),
  refetchInterval:(state)=>["queued","processing"].includes(state.state.data?.status ?? "") ? 3000 : false
});
const start=useMutation({
  mutationFn:()=>startAudioAnalysis(props.conversationId,props.datasetGroupId,force.value),
  onSuccess:()=>client.invalidateQueries({queryKey:audioKeys.detail(props.conversationId,props.datasetGroupId)})
});
const analysis=computed(()=>query.data.value);
const complete=computed(()=>["completed","partial"].includes(analysis.value?.status ?? ""));
const label=computed(()=>analysis.value?.status?.replaceAll("_"," ") ?? "not analyzed");
function seek(seconds:number){ if(player.value){player.value.currentTime=seconds;void player.value.play();} }
</script>
<template>
  <section v-if="hasAudio" class="rounded-[1.75rem] border border-line bg-white p-5 sm:p-6" aria-labelledby="audio-intelligence-title">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><div class="flex items-center gap-2"><Headphones class="text-primary" :size="20" /><h2 id="audio-intelligence-title" class="text-lg font-bold text-ink">Audio Intelligence</h2></div>
        <p class="mt-1 text-sm text-muted">Local CPU diarization and acoustic measurements. dBFS values are not calibrated sound-pressure levels.</p></div>
      <div class="flex items-center gap-2"><span class="rounded-full bg-surface px-3 py-1 text-xs font-semibold capitalize">{{ label }}</span>
        <button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="start.isPending.value || ['queued','processing'].includes(analysis?.status ?? '')" @click="start.mutate()">
          <RefreshCw v-if="start.isPending.value" class="animate-spin" :size="16" /><Activity v-else :size="16" />{{ complete ? "Reanalyze" : "Analyze audio" }}
        </button></div>
    </div>
    <audio ref="player" class="mt-4 w-full" controls preload="metadata" :src="audioPlaybackUrl(conversationId,datasetGroupId)">Your browser does not support audio playback.</audio>
    <label v-if="complete" class="mt-3 inline-flex items-center gap-2 text-xs text-muted"><input v-model="force" type="checkbox" /> Force a new versioned run</label>
    <div v-if="query.isLoading.value" class="mt-6 animate-pulse rounded-xl bg-surface p-8 text-sm text-muted">Loading audio status…</div>
    <div v-else-if="query.isError.value || start.isError.value" class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"><AlertTriangle class="mr-2 inline" :size="17" />Could not load or schedule audio analysis.</div>
    <div v-else-if="analysis?.status === 'failed' || analysis?.status === 'unavailable' || analysis?.status === 'publish_failed'" class="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      <p class="font-semibold">{{ analysis.error_code ?? "Audio analysis unavailable" }}</p><p class="mt-1">The transcript and existing evaluation remain available and unchanged.</p>
    </div>
    <div v-else-if="analysis?.status === 'queued' || analysis?.status === 'processing'" class="mt-6 rounded-xl bg-primary-soft p-4 text-sm text-primary">Analysis is {{ analysis.status }}. This panel updates automatically.</div>
    <div v-else-if="complete && analysis?.recording_metrics" class="mt-6 space-y-6">
      <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted"><span>Model: {{ analysis.model_id }}@{{ analysis.model_revision }}</span><span v-if="analysis.quality_indicators?.alignment_confidence != null">Alignment confidence: {{ (analysis.quality_indicators.alignment_confidence*100).toFixed(0) }}%</span><span v-if="analysis.quality_indicators?.role_mapping_uncertain">Some roles remain unknown</span></div>
      <AudioMetricsOverview :metrics="analysis.recording_metrics" />
      <AudioCharts :analysis="analysis" />
      <div><h3 class="mb-3 font-bold">Speaker timeline</h3><SpeakerTimeline :segments="analysis.diarization_segments ?? []" :overlaps="analysis.overlap_segments ?? []" :duration="Number(analysis.recording_metrics.recording_duration_seconds ?? 1)" @select="seek" /><p class="mt-2 text-xs text-muted">Red markers indicate observed overlap. Select a segment to request playback at that offset when a compatible player is present.</p></div>
      <div><h3 class="mb-3 font-bold">Speaker statistics</h3><SpeakerMetrics :speakers="analysis.speaker_metrics ?? []" /></div>
    </div>
    <div v-else class="mt-6 rounded-xl bg-surface p-5 text-sm text-muted">No acoustic analysis has been run. Analysis is explicit and processes only this conversation.</div>
  </section>
</template>
