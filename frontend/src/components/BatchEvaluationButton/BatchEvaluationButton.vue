<script setup lang="ts">
import { PlayCircle } from "lucide-vue-next";
defineEmits<{ click: [] }>();
</script>

<template>
  <button type="button" class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-white px-5 text-sm font-semibold text-primary transition hover:bg-primary/5" @click="$emit('click')">
    <PlayCircle :size="18" aria-hidden="true" /> Batch Evaluation
  </button>
</template>
