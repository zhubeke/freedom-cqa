<template>
  <div aria-label="Loading conversation" aria-busy="true" class="animate-pulse space-y-6">
    <div class="rounded-[1.75rem] bg-white p-6 sm:p-7">
      <div class="h-4 w-40 rounded bg-surface-strong" />
      <div class="mt-7 flex gap-4"><div class="size-12 rounded-2xl bg-surface-strong" /><div class="flex-1 space-y-3"><div class="h-6 w-52 max-w-full rounded bg-surface-strong" /><div class="h-3 w-64 max-w-full rounded bg-surface-strong" /></div></div>
    </div>
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="rounded-[1.75rem] bg-white p-6">
        <div class="h-5 w-28 rounded bg-surface-strong" />
        <div class="mt-10 space-y-7">
          <div v-for="item in 5" :key="item" class="flex" :class="item % 2 === 0 ? 'justify-end' : 'justify-start'">
            <div class="w-2/3 space-y-2"><div class="h-3 w-20 rounded bg-surface-strong" /><div class="h-20 rounded-2xl bg-surface" /></div>
          </div>
        </div>
      </div>
      <div class="hidden h-96 rounded-[1.5rem] bg-white lg:block" />
    </div>
  </div>
</template>
