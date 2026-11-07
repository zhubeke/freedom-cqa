<script setup lang="ts">
import type { SpeakerAudioMetrics } from "../../shared/types/audio";
defineProps<{ speakers: SpeakerAudioMetrics[] }>();
const seconds=(value:number|null)=>value===null?"Unavailable":`${value.toFixed(1)} s`;
</script>
<template>
  <div class="overflow-x-auto">
    <table class="w-full min-w-[48rem] text-left text-sm">
      <thead class="text-xs uppercase text-muted"><tr><th class="p-2">Speaker / role</th><th>Speaking</th><th>Turns</th><th>Avg turn</th><th>RMS</th><th>Longest pause</th><th>Overlap</th><th>Interruptions</th></tr></thead>
      <tbody><tr v-for="speaker in speakers" :key="speaker.speaker_id" class="border-t border-line">
        <td class="p-2 font-semibold">{{ speaker.speaker_id }} <span class="ml-1 rounded bg-surface px-2 py-1 text-xs">{{ speaker.inferred_role }}</span></td>
        <td>{{ seconds(speaker.total_speaking_seconds) }}</td><td>{{ speaker.speech_segment_count }}</td><td>{{ seconds(speaker.average_turn_seconds) }}</td>
        <td>{{ speaker.rms_dbfs === null ? "Unavailable" : `${speaker.rms_dbfs.toFixed(1)} dBFS` }}</td><td>{{ seconds(speaker.longest_pause_seconds) }}</td>
        <td>{{ seconds(speaker.overlap_involvement_seconds) }}</td><td>{{ speaker.interruption_initiations_estimate }} / {{ speaker.interruption_receipts_estimate }} received</td>
      </tr></tbody>
    </table>
  </div>
</template>
