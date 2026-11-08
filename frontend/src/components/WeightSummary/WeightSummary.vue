<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, CheckCircle2, ChevronDown } from "lucide-vue-next";
import { scoringWeight, type ChecklistValidationIssue } from "../../shared/checklist-validation";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";
const props = defineProps<{ criteria: ChecklistCriterion[]; sections: ChecklistSection[]; issues: ChecklistValidationIssue[] }>();
const emit = defineEmits<{ navigate: [issue: ChecklistValidationIssue] }>();
const enabled = computed(() => props.criteria.filter((item) => item.enabled));
const total = computed(() => scoringWeight(props.criteria));
const initialOpen = window.matchMedia("(min-width: 1024px)").matches;
const categories = [{ id: "weight", name: "Weight validation" }, { id: "scale", name: "Scoring-scale validation" }, { id: "configuration", name: "Configuration" }] as const;
</script>
<template>
  <details id="checklist-validation" :open="initialOpen" class="scroll-mt-24 rounded-lg border border-line bg-white lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><span><span class="block text-[11px] font-bold uppercase tracking-wide text-muted">Scoring configuration</span><span class="mt-1 flex items-center gap-2"><strong class="text-xl">{{ total }} <span class="text-sm font-medium text-muted">/ 100 points</span></strong><CheckCircle2 v-if="!issues.length" :size="17" class="text-emerald-700" /><AlertCircle v-else :size="17" class="text-amber-600" /></span></span><ChevronDown :size="16" class="text-muted" /></summary>
    <div class="border-t border-line px-4 pb-4 pt-3">
      <dl class="space-y-2 text-xs leading-5"><div v-for="section in [...sections].sort((a,b) => a.display_order - b.display_order)" :key="section.id" class="flex justify-between gap-3"><dt class="text-muted">{{ section.name || 'Unnamed section' }}</dt><dd class="shrink-0 font-semibold">{{ scoringWeight(criteria.filter((item) => item.section_id === section.id)) }}</dd></div></dl>
      <p class="mt-3 border-t border-line pt-3 text-xs text-muted">{{ enabled.length }} enabled · {{ enabled.filter((item) => item.na_enabled).length }} allow N/A</p>
      <template v-if="issues.length"><div v-for="category in categories" :key="category.id" class="mt-3"><template v-if="issues.some((issue) => issue.category === category.id)"><h3 class="mb-1 text-xs font-semibold text-amber-900">{{ category.name }}</h3><ul class="space-y-1"><li v-for="issue in issues.filter((item) => item.category === category.id)" :key="issue.id"><button type="button" class="w-full rounded py-1 text-left text-xs leading-5 text-amber-800 underline decoration-amber-300 underline-offset-2 hover:bg-amber-50" @click="emit('navigate', issue)">{{ issue.message }}</button></li></ul></template></div></template>
      <p v-else class="mt-3 text-xs font-semibold text-emerald-700">Configuration ready to save</p>
    </div>
  </details>
</template>
