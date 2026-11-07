<script setup lang="ts">
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ClipboardList, Plus } from "lucide-vue-next";
import { useRouter } from "vue-router";
import ChecklistCard from "../../components/ChecklistCard/ChecklistCard.vue";
import { checklistKeys, createChecklist, listChecklists } from "../../api/checklists";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

const router = useRouter(); const queryClient = useQueryClient();
const query = useQuery({ queryKey: checklistKeys.all, queryFn: ({ signal }) => listChecklists(signal) });
const orderedChecklists = computed(() => [...(query.data.value ?? [])].sort((left, right) => {
  if (left.id === "freedom-default-checklist") return -1;
  if (right.id === "freedom-default-checklist") return 1;
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}));
const createMutation = useMutation({
  mutationFn: () => { const suffix = `${new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date())} · ${crypto.randomUUID().slice(0, 4)}`; const section: ChecklistSection = { id: crypto.randomUUID(), display_order: 1, name: "Quality criteria" }; const criterion: ChecklistCriterion = { id: crypto.randomUUID(), code: "01", display_order: 1, section_id: section.id, source_name: "", display_name: "New criterion", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 100, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true }; return createChecklist({ name: `New Quality Checklist ${suffix}`, description: "Configure this checklist for your evaluation workflow.", sections: [section], criteria: [criterion] }); },
  onSuccess: async ({ checklist }) => { await queryClient.invalidateQueries({ queryKey: checklistKeys.all }); await router.push(`/checklists/${checklist.id}/edit`); }
});
</script>
<template>
  <section>
    <header class="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div class="mb-2 inline-flex items-center gap-2 text-sm font-bold text-primary"><ClipboardList :size="18" /> Quality configuration</div><h1 class="text-3xl font-black tracking-tight sm:text-4xl">Checklists</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Build versioned evaluation criteria without changing historical configurations.</p></div><button type="button" class="button-primary" :disabled="createMutation.isPending.value" @click="createMutation.mutate()"><Plus :size="18" />{{ createMutation.isPending.value ? 'Creating…' : 'Create checklist' }}</button></header>
    <div v-if="query.isPending.value" class="grid gap-4 md:grid-cols-2"><div v-for="item in 2" :key="item" class="h-64 animate-pulse rounded-2xl bg-white" /></div>
    <div v-else-if="query.isError.value" class="rounded-2xl border border-primary/20 bg-primary-soft p-5 text-sm text-primary">{{ query.error.value?.message }} <button class="ml-2 font-bold underline" @click="query.refetch()">Try again</button></div>
    <div v-else class="grid gap-4 md:grid-cols-2"><ChecklistCard v-for="checklist in orderedChecklists" :key="checklist.id" :checklist="checklist" :featured="checklist.id === 'freedom-default-checklist'" /></div>
    <p v-if="createMutation.isError.value" class="mt-4 text-sm font-semibold text-primary">{{ createMutation.error.value?.message }}</p>
  </section>
</template>
