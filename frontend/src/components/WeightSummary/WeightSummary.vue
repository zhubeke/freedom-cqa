<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, CheckCircle2 } from "lucide-vue-next";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";
const props = defineProps<{ criteria: ChecklistCriterion[]; sections: ChecklistSection[] }>();
const enabled = computed(() => props.criteria.filter((item) => item.enabled));
const total = computed(() => enabled.value.filter((item) => item.answer_type !== "flag").reduce((sum, item) => sum + Number(item.weight || 0), 0));
const warnings = computed(() => {
  const result: string[] = [];
  if (total.value !== 100) result.push(`Scoring weight must equal 100 (currently ${total.value}).`);
  if (!enabled.value.some((item) => item.answer_type !== "flag" && item.weight > 0)) result.push("Add at least one positively weighted scoring criterion.");
  const sectionIds = new Set(props.sections.map((item) => item.id));
  for (const item of props.criteria) {
    if (!item.display_name.trim()) result.push(`${item.code}: criterion name is required.`);
    if (!sectionIds.has(item.section_id)) result.push(`${item.code}: choose a valid section.`);
    if (item.na_enabled && !item.na_rule.trim()) result.push(`${item.code}: add an N/A applicability rule.`);
    if (item.answer_type === "flag" && item.weight !== 0) result.push(`${item.code}: flag weight must be zero.`);
    if (item.answer_type === "numeric") { const values = item.numeric_scale.map((option) => option.value); if (values.length < 2 || values[0] !== 0 || (values.at(-1) ?? 0) <= 0 || values.some((value, index) => index > 0 && value <= values[index - 1]! ) || item.numeric_scale.some((option) => !option.description.trim())) result.push(`${item.code}: numeric scale must be ascending, start at 0, and include descriptions.`); }
  }
  return [...new Set(result)];
});
defineExpose({ valid: computed(() => warnings.value.length === 0), warnings });
</script>
<template>
  <aside class="rounded-2xl border border-line bg-white p-5 shadow-sm">
    <div class="flex items-end justify-between"><div><p class="text-xs font-bold uppercase tracking-wide text-muted">Scoring weight</p><p class="mt-1 text-3xl font-black" :class="total === 100 ? 'text-ink' : 'text-primary'">{{ total }} <span class="text-base font-bold text-muted">/ 100</span></p></div><CheckCircle2 v-if="warnings.length === 0" class="text-emerald-500" :size="28" /><AlertCircle v-else class="text-primary" :size="28" /></div>
    <div class="mt-4 grid grid-cols-2 gap-2 text-sm"><div class="rounded-xl bg-surface p-3"><strong class="block text-lg">{{ enabled.length }}</strong><span class="text-muted">Enabled</span></div><div class="rounded-xl bg-surface p-3"><strong class="block text-lg">{{ enabled.filter(item => item.na_enabled).length }}</strong><span class="text-muted">With N/A</span></div></div>
    <ul v-if="warnings.length" class="mt-4 space-y-2 text-xs leading-5 text-primary"><li v-for="warning in warnings" :key="warning" class="flex gap-2"><span>•</span><span>{{ warning }}</span></li></ul><p v-else class="mt-4 text-xs font-semibold text-emerald-600">Configuration is ready to save.</p>
  </aside>
</template>
