<script setup lang="ts">
import AppHeader from "../AppHeader/AppHeader.vue";
</script>

<template>
  <div class="min-h-screen bg-surface text-ink">
    <AppHeader />
    <main class="mx-auto w-full max-w-[76rem] px-4 py-7 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <RouterView />
    </main>
  </div>
</template>
