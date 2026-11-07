<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import ChecklistSectionComponent from "../ChecklistSection/ChecklistSection.vue";
import type { ChecklistCriterion, ChecklistSection } from "../../shared/types/checklist";

const props = defineProps<{ sections: ChecklistSection[]; criteria: ChecklistCriterion[]; readonly?: boolean }>();
const emit = defineEmits<{ "update:sections": [value: ChecklistSection[]]; "update:criteria": [value: ChecklistCriterion[]] }>();
const orderedSections = () => [...props.sections].sort((a, b) => a.display_order - b.display_order);
const sectionCriteria = (sectionId: string) => props.criteria.filter((item) => item.section_id === sectionId).sort((a, b) => a.display_order - b.display_order);
const resequenceSections = (items: ChecklistSection[]) => items.map((item, index) => ({ ...item, display_order: index + 1 }));
const resequenceCriteria = (items: ChecklistCriterion[]) => items.map((item, index) => ({ ...item, display_order: index + 1 }));
const updateSection = (value: ChecklistSection) => emit("update:sections", props.sections.map((item) => item.id === value.id ? value : item));
const removeSection = (id: string) => emit("update:sections", resequenceSections(orderedSections().filter((item) => item.id !== id)));
const moveSection = (id: string, direction: -1 | 1) => { const next = orderedSections(); const index = next.findIndex((item) => item.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target]!, next[index]!]; emit("update:sections", resequenceSections(next)); };
const updateCriterion = (value: ChecklistCriterion) => emit("update:criteria", props.criteria.map((item) => item.id === value.id ? value : item));
const removeCriterion = (id: string) => emit("update:criteria", resequenceCriteria([...props.criteria].sort((a, b) => a.display_order - b.display_order).filter((item) => item.id !== id)));
const moveCriterion = (sectionId: string, id: string, direction: -1 | 1) => { const local = sectionCriteria(sectionId); const index = local.findIndex((item) => item.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= local.length) return; [local[index], local[target]] = [local[target]!, local[index]!]; const localIds = new Set(local.map((item) => item.id)); const ordered = [...props.criteria].sort((a, b) => a.display_order - b.display_order); let cursor = 0; const merged = ordered.map((item) => localIds.has(item.id) ? local[cursor++]! : item); emit("update:criteria", resequenceCriteria(merged)); };
const addSection = () => emit("update:sections", [...orderedSections(), { id: crypto.randomUUID(), display_order: props.sections.length + 1, name: "New section" }]);
const addCriterion = (sectionId: string) => { const number = props.criteria.length + 1; const criterion: ChecklistCriterion = { id: crypto.randomUUID(), code: String(number).padStart(2, "0"), display_order: number, section_id: sectionId, source_name: "", display_name: "New criterion", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 0, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true }; emit("update:criteria", [...props.criteria, criterion]); };
</script>
<template>
  <div class="space-y-5">
    <ChecklistSectionComponent v-for="(section, index) in orderedSections()" :key="section.id" :section="section" :sections="sections" :criteria="sectionCriteria(section.id)" :index="index" :total="sections.length" :readonly="readonly" @update-section="updateSection" @remove-section="removeSection(section.id)" @move-section="moveSection(section.id, $event)" @add-criterion="addCriterion(section.id)" @update-criterion="updateCriterion" @remove-criterion="removeCriterion" @move-criterion="(id, direction) => moveCriterion(section.id, id, direction)" />
    <button v-if="!readonly" type="button" class="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white text-sm font-bold text-muted transition hover:border-primary/40 hover:text-primary" @click="addSection"><Plus :size="19" /> Add section</button>
  </div>
</template>
