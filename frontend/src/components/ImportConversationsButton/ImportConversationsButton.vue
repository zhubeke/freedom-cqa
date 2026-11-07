<script setup lang="ts">
import { Upload } from "lucide-vue-next";
defineEmits<{ click: [] }>();
</script>
<template>
  <button type="button" class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover" @click="$emit('click')">
    <Upload :size="18" aria-hidden="true" /> Import conversations
  </button>
</template>
