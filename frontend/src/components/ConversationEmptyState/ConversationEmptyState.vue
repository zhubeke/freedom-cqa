<script setup lang="ts">
import { visualAssets } from "../../assets";

withDefaults(defineProps<{ filtered?: boolean }>(), { filtered: false });
</script>

<template>
  <div class="flex min-h-[24rem] flex-col items-center justify-center px-6 py-12 text-center sm:min-h-[28rem]">
    <img
      :src="filtered ? visualAssets.illustrations.noResults : visualAssets.illustrations.emptyConversations"
      alt=""
      class="mb-2 h-auto w-full max-w-[17rem]"
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
  </div>
</template>
