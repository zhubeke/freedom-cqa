<script setup lang="ts">
const props = defineProps<{ metrics: Record<string, number | number[] | Array<{ time_seconds: number; rms_dbfs: number | null }> | null> }>();
const percent = (value: unknown) => typeof value === "number" ? `${(value*100).toFixed(1)}%` : "Unavailable";
const seconds = (value: unknown) => typeof value === "number" ? `${value.toFixed(1)} s` : "Unavailable";
</script>
<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Duration</p><p class="mt-1 font-bold">{{ seconds(props.metrics.recording_duration_seconds) }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Speakers</p><p class="mt-1 font-bold">{{ props.metrics.detected_speaker_count ?? "Unavailable" }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Speech</p><p class="mt-1 font-bold">{{ percent(props.metrics.speech_ratio) }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Silence</p><p class="mt-1 font-bold">{{ percent(props.metrics.silence_ratio) }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Overlap</p><p class="mt-1 font-bold">{{ seconds(props.metrics.total_overlap_seconds) }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Possible interruptions</p><p class="mt-1 font-bold">{{ props.metrics.interruption_count_estimate ?? "Unavailable" }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">Longest silence</p><p class="mt-1 font-bold">{{ seconds(props.metrics.longest_silence_seconds) }}</p></div>
    <div class="rounded-xl bg-surface p-3"><p class="text-xs text-muted">RMS</p><p class="mt-1 font-bold">{{ typeof props.metrics.rms_dbfs === "number" ? `${props.metrics.rms_dbfs.toFixed(1)} dBFS` : "Unavailable" }}</p></div>
  </div>
</template>
