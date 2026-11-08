<script setup lang="ts">
import { RotateCcw, Upload } from "lucide-vue-next";
import { visualAssets } from "../../assets";

withDefaults(defineProps<{ filtered?: boolean }>(), { filtered: false });
defineEmits<{ import: []; clearFilters: [] }>();
</script>

<template>
  <div class="flex min-h-[20rem] flex-col items-center justify-center px-6 py-8 text-center">
    <img
      :src="filtered ? visualAssets.illustrations.noResults : visualAssets.illustrations.emptyConversations"
      alt=""
      class="mb-2 h-auto w-full max-w-[10rem]"
    />
    <h2 class="text-xl font-bold tracking-[-0.015em] text-ink sm:text-2xl">
      {{ filtered ? "No matching conversations" : "No conversations yet" }}
    </h2>
    <p class="mt-2 max-w-sm text-sm leading-6 text-muted sm:text-base">
      {{
        filtered
          ? "Try adjusting your search or filters."
          : "Import conversations to start evaluating customer interactions."
      }}
    </p>
    <button
      v-if="filtered"
      type="button"
      class="button-secondary mt-5"
      @click="$emit('clearFilters')"
    >
      <RotateCcw :size="17" aria-hidden="true" />
      Clear filters
    </button>
    <button
      v-else
      type="button"
      class="button-primary mt-5"
      @click="$emit('import')"
    >
      <Upload :size="17" aria-hidden="true" />
      Import conversations
    </button>
  </div>
</template>
