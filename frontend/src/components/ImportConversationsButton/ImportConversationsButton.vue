<script setup lang="ts">
import { Upload } from "lucide-vue-next";
defineEmits<{ click: [] }>();
</script>
<template>
  <button type="button" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:opacity-90" @click="$emit('click')">
    <Upload :size="18" aria-hidden="true" /> Import conversations
  </button>
</template>
