<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

const props = defineProps<{ sections: ChecklistSection[]; criteria: ChecklistCriterion[] }>();
const expanded = ref<Set<string>>(new Set());
const orderedSections = computed(() => [...props.sections].sort((a, b) => a.display_order - b.display_order));
const sectionCriteria = (sectionId: string) => props.criteria.filter((criterion) => criterion.enabled && criterion.section_id === sectionId).sort((a, b) => a.display_order - b.display_order);
const criterionName = (criterion: ChecklistCriterion) => criterion.source_name || criterion.display_name;
const answerType = (criterion: ChecklistCriterion) => criterion.answer_type === "boolean" ? "Да / Нет" : criterion.answer_type === "numeric" ? "Числовая шкала" : "Флаг нарушения";
const scale = (criterion: ChecklistCriterion) => criterion.numeric_scale.map((option) => option.value).join(" / ");
const toggle = (id: string) => { const next = new Set(expanded.value); next.has(id) ? next.delete(id) : next.add(id); expanded.value = next; };
</script>

<template>
  <div class="space-y-7" data-testid="checklist-viewer">
    <section v-for="(section, sectionIndex) in orderedSections" :key="section.id" :data-testid="`checklist-section-${section.id}`">
      <h2 class="mb-3 flex items-center gap-3 text-lg font-extrabold"><span class="text-sm text-primary">{{ String(sectionIndex + 1).padStart(2, '0') }}</span>{{ section.name }}</h2>
      <div class="space-y-2">
        <article v-for="criterion in sectionCriteria(section.id)" :key="criterion.id" class="overflow-hidden rounded-2xl border border-line bg-white shadow-sm" :data-testid="`criterion-${criterion.code}`">
          <button type="button" class="grid w-full items-center gap-3 px-4 py-4 text-left sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto_auto_1.5rem] sm:px-5" :aria-expanded="expanded.has(criterion.id)" @click="toggle(criterion.id)">
            <span class="text-xs font-extrabold text-primary">{{ criterion.code }}</span>
            <strong class="min-w-0">{{ criterionName(criterion) }}</strong>
            <span class="w-fit rounded-lg bg-surface px-2.5 py-1 text-xs font-bold">{{ criterion.answer_type === 'flag' ? '0 баллов' : `${criterion.weight} баллов` }}</span>
            <span class="text-xs font-semibold text-muted">{{ criterion.answer_type === 'numeric' ? `${answerType(criterion)} · ${scale(criterion)}` : answerType(criterion) }}</span>
            <span class="text-xs font-bold" :class="criterion.na_enabled ? 'text-primary' : 'text-muted'">{{ criterion.na_enabled ? 'N/A доступно' : 'N/A недоступно' }}</span>
            <ChevronDown :size="18" class="text-muted transition-transform" :class="{ 'rotate-180': expanded.has(criterion.id) }" />
          </button>
          <div v-if="expanded.has(criterion.id)" class="grid gap-5 border-t border-line bg-surface/45 px-5 py-5 text-sm leading-6 md:grid-cols-2">
            <div><p class="text-xs font-bold uppercase tracking-wide text-muted">Правила оценки</p><p class="mt-1">{{ criterion.evaluation_instructions || criterion.description }}</p></div>
            <div><p class="text-xs font-bold uppercase tracking-wide text-muted">Когда выбрать N/A</p><p class="mt-1">{{ criterion.na_enabled ? criterion.na_rule : 'N/A не предусмотрено для этого критерия.' }}</p></div>
            <div v-if="criterion.answer_type === 'numeric'" class="md:col-span-2"><p class="text-xs font-bold uppercase tracking-wide text-muted">Шкала</p><ul class="mt-2 grid gap-2 sm:grid-cols-2"><li v-for="option in criterion.numeric_scale" :key="option.value" class="rounded-xl bg-white p-3"><strong class="text-primary">{{ option.value }}</strong> — {{ option.description }}</li></ul></div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
