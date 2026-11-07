<script setup lang="ts">
import { computed } from "vue";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";
const props = defineProps<{ sections: ChecklistSection[]; criteria: ChecklistCriterion[] }>();
const orderedSections = computed(() => [...props.sections].sort((a, b) => a.display_order - b.display_order));
const choices = (criterion: ChecklistCriterion) => criterion.answer_type === "numeric" ? criterion.numeric_scale.map((item) => String(item.value)) : criterion.answer_type === "flag" ? ["Violation found", "No violation"] : ["Yes", "No"];
</script>
<template>
  <div class="space-y-5">
    <section v-for="section in orderedSections" :key="section.id" class="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <header class="border-b border-line bg-surface/70 px-5 py-3"><h3 class="text-sm font-extrabold">{{ section.name }}</h3></header>
      <div class="divide-y divide-line">
        <article v-for="criterion in criteria.filter(item => item.enabled && item.section_id === section.id).sort((a, b) => a.display_order - b.display_order)" :key="criterion.id" class="p-5">
          <div class="flex items-start justify-between gap-4"><div><span class="text-xs font-extrabold text-primary">{{ criterion.code }}</span><h4 class="mt-1 font-bold">{{ criterion.display_name }}</h4></div><span class="shrink-0 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold">{{ criterion.answer_type === 'flag' ? 'Flag' : `${criterion.weight} pts` }}</span></div>
          <p class="mt-2 text-sm leading-6 text-muted">{{ criterion.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2"><span v-for="choice in choices(criterion)" :key="choice" class="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold">{{ choice }}</span><span v-if="criterion.na_enabled" class="rounded-lg border border-primary/20 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">N/A</span></div>
          <ul v-if="criterion.answer_type === 'numeric'" class="mt-3 space-y-1.5 text-xs text-muted"><li v-for="option in criterion.numeric_scale" :key="option.value"><strong class="text-ink">{{ option.value }}</strong> — {{ option.description }}</li></ul>
        </article>
      </div>
    </section>
  </div>
</template>
