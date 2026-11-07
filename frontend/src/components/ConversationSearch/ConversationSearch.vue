<script setup lang="ts">
import { Search, X } from "lucide-vue-next";

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="relative w-full">
    <Search class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" :size="19" aria-hidden="true" />
    <input
      v-model="model"
      type="search"
      name="conversation-search"
      aria-label="Search conversations"
      placeholder="Search by customer or reference"
      class="h-11 w-full rounded-xl border border-line bg-white pl-11 pr-11 text-sm text-ink outline-none transition placeholder:text-muted focus:border-primary/50 focus:ring-3 focus:ring-primary/10"
    />
    <button
      v-if="model"
      type="button"
      class="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted transition hover:bg-white hover:text-ink"
      aria-label="Clear search"
      @click="model = ''"
    >
      <X :size="17" aria-hidden="true" />
    </button>
  </div>
</template>
