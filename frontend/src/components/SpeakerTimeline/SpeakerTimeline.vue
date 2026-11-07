<script setup lang="ts">
import { computed } from "vue";
import type { AudioOverlap, AudioSegment } from "../../shared/types/audio";
const props = defineProps<{ segments: AudioSegment[]; overlaps: AudioOverlap[]; duration: number }>();
const emit = defineEmits<{ select: [seconds: number] }>();
const speakers = computed(() => [...new Set(props.segments.map((item) => item.speaker_id))]);
const colors = ["#5b4ef5", "#0ea5e9", "#f59e0b", "#10b981", "#e11d48", "#8b5cf6"];
const color = (id: string) => colors[Math.max(0, speakers.value.indexOf(id)) % colors.length];
const left = (value: number) => `${Math.max(0, Math.min(100, value / props.duration * 100))}%`;
const width = (start: number, end: number) => `${Math.max(.2, (end-start) / props.duration * 100)}%`;
</script>
<template>
  <div class="space-y-2" aria-label="Speaker timeline">
    <div v-for="speaker in speakers" :key="speaker" class="grid grid-cols-[6rem_1fr] items-center gap-3">
      <span class="truncate text-xs font-semibold text-muted">{{ speaker }}</span>
      <div class="relative h-7 rounded-lg bg-surface">
        <button v-for="(segment, index) in segments.filter((x) => x.speaker_id === speaker)" :key="index" type="button"
          class="absolute top-1 h-5 rounded-md opacity-85 hover:opacity-100 focus:outline-primary"
          :style="{ left: left(segment.start_seconds), width: width(segment.start_seconds, segment.end_seconds), backgroundColor: color(speaker) }"
          :title="`${speaker}: ${segment.start_seconds.toFixed(1)}–${segment.end_seconds.toFixed(1)}s`"
          @click="emit('select', segment.start_seconds)" />
        <span v-for="(overlap, index) in overlaps.filter((x) => x.speaker_ids.includes(speaker))" :key="`o${index}`"
          class="pointer-events-none absolute bottom-0 h-1 bg-red-500" :style="{ left: left(overlap.start_seconds), width: width(overlap.start_seconds, overlap.end_seconds) }" />
      </div>
    </div>
  </div>
</template>
