<script setup lang="ts">
import { Menu, MessagesSquare, X } from "lucide-vue-next";
import { ref } from "vue";
import { visualAssets } from "../../assets";

const mobileMenuOpen = ref(false);
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line/90 bg-white/95 backdrop-blur-md">
    <div class="mx-auto flex h-[4.5rem] w-full max-w-[76rem] items-center justify-between px-4 sm:px-6 lg:px-8">
      <RouterLink to="/conversations" class="group flex items-center gap-3 rounded-xl" aria-label="CQA home" @click="mobileMenuOpen = false">
        <img :src="visualAssets.logos.cqaMark" alt="" class="size-10 transition-transform duration-200 group-hover:scale-[1.04]" />
        <span class="leading-none">
          <span class="block text-xl font-bold tracking-[-0.02em] text-ink">CQA</span>
          <span class="mt-1 hidden text-[0.65rem] font-medium tracking-wide text-muted sm:block">Conversation quality</span>
        </span>
      </RouterLink>

      <nav class="hidden self-stretch sm:flex" aria-label="Main navigation">
        <RouterLink
          to="/conversations"
          class="relative inline-flex items-center gap-2 px-4 text-sm font-semibold text-muted transition-colors hover:text-ink"
          active-class="!text-primary after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-primary"
        >
          <MessagesSquare :size="18" :stroke-width="2" aria-hidden="true" />
          Conversations
        </RouterLink>
      </nav>

      <button
        type="button"
        class="grid size-11 place-items-center rounded-xl bg-surface text-ink transition-colors hover:bg-surface-strong sm:hidden"
        :aria-expanded="mobileMenuOpen"
        aria-controls="mobile-navigation"
        :aria-label="mobileMenuOpen ? 'Close navigation' : 'Open navigation'"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <X v-if="mobileMenuOpen" :size="22" aria-hidden="true" />
        <Menu v-else :size="22" aria-hidden="true" />
      </button>
    </div>

    <nav v-if="mobileMenuOpen" id="mobile-navigation" class="border-t border-line bg-white px-4 py-3 sm:hidden" aria-label="Mobile navigation">
      <RouterLink
        to="/conversations"
        class="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-muted"
        active-class="!bg-primary-soft !text-primary"
        @click="mobileMenuOpen = false"
      >
        <MessagesSquare :size="19" aria-hidden="true" />
        Conversations
      </RouterLink>
    </nav>
  </header>
</template>
