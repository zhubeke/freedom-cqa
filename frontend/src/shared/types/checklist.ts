export type AnswerType = "boolean" | "numeric" | "flag";
export interface NumericScaleOption { value: number; description: string }
export interface ChecklistSection { id: string; display_order: number; name: string }
export interface ChecklistCriterion {
  id: string; code: string; display_order: number; section_id: string; source_name: string;
  display_name: string; description: string; evaluation_instructions: string; answer_type: AnswerType;
  weight: number; numeric_scale: NumericScaleOption[]; na_enabled: boolean; na_rule: string; enabled: boolean;
}
export interface ChecklistVersion {
  id: string; checklist_id: string; version_number: number; created_at: string; created_from_version_id: string | null;
  sections: ChecklistSection[]; criteria: ChecklistCriterion[]; total_scoring_weight: number; schema_version: number;
}
export interface Checklist {
  id: string; name: string; description: string; active_version_id: string | null; created_at: string; updated_at: string;
  is_active?: boolean;
}
export interface ChecklistDetail extends Checklist { active_version: ChecklistVersion | null }
export interface ChecklistSummary extends Checklist {
  active_version_number: number | null; criterion_count: number; total_scoring_weight: number;
  enabled_criterion_count?: number; can_delete?: boolean; can_deactivate?: boolean;
}
