<script setup lang="ts">
import AppHeader from "../AppHeader/AppHeader.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const workspace = computed(() => route.name === "conversation-detail");
const reviewPage = computed(() => workspace.value || ["conversations", "reviews", "checklists", "checklist-edit"].includes(String(route.name)));
</script>

<template>
  <div class="app-shell min-h-screen bg-surface text-ink" :class="{ 'app-shell-workspace': workspace, 'app-shell-review': reviewPage }">
    <AppHeader />
    <main class="app-main w-full min-w-0 px-4 py-4 sm:px-6 lg:px-8" :class="{ 'workspace-main': workspace }">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell-review { overflow-x: clip; }
:global(body:has(.app-shell-review)) {
  --color-primary: #334155;
  --color-primary-hover: #1e293b;
  --color-primary-pressed: #0f172a;
  --color-primary-soft: #f1f5f9;
}
:global(body:has(.app-shell-review) :focus-visible) { outline: 2px solid #64748b; outline-offset: 3px; }
@media (min-width: 1024px) {
  :global(html:has(.app-shell-workspace)), :global(body:has(.app-shell-workspace)) { height: 100dvh; overflow: hidden; }
  .app-shell-workspace { position: fixed; inset: 0; height: 100dvh; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .app-shell-workspace > :first-child { flex: none; }
  .workspace-main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
}
</style>
