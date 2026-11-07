export type AnswerType = "boolean" | "numeric" | "flag";

export interface NumericScaleOption {
  value: number;
  description: string;
}

export interface ChecklistSection {
  id: string;
  display_order: number;
  name: string;
}

export interface ChecklistCriterion {
  id: string;
  code: string;
  display_order: number;
  section_id: string;
  source_name: string;
  display_name: string;
  description: string;
  evaluation_instructions: string;
  answer_type: AnswerType;
  weight: number;
  numeric_scale: NumericScaleOption[];
  na_enabled: boolean;
  na_rule: string;
  enabled: boolean;
}

export interface ChecklistConfiguration {
  sections: ChecklistSection[];
  criteria: ChecklistCriterion[];
}

export interface ChecklistRecord {
  id: string;
  name: string;
  description: string;
  active_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChecklistVersionRecord extends ChecklistConfiguration {
  id: string;
  checklist_id: string;
  version_number: number;
  created_at: Date;
  created_from_version_id: string | null;
  total_scoring_weight: number;
  schema_version: number;
}

export interface ChecklistSummary extends ChecklistRecord {
  active_version_number: number | null;
  criterion_count: number;
  total_scoring_weight: number;
}

export interface ChecklistRepository {
  ensureIndexes(): Promise<void>;
  list(): Promise<ChecklistSummary[]>;
  findChecklist(id: string): Promise<ChecklistRecord | null>;
  findVersion(checklistId: string, versionId: string): Promise<ChecklistVersionRecord | null>;
  listVersions(checklistId: string): Promise<ChecklistVersionRecord[]>;
  createChecklist(input: { id?: string; name: string; description: string; configuration: ChecklistConfiguration }): Promise<{ checklist: ChecklistRecord; version: ChecklistVersionRecord }>;
  createVersion(input: { checklistId: string; createdFromVersionId: string; name: string; description: string; configuration: ChecklistConfiguration }): Promise<ChecklistVersionRecord>;
  activateVersion(input: { checklistId: string; versionId: string; expectedActiveVersionId: string | null }): Promise<ChecklistRecord>;
}

export class ChecklistError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly code = "CHECKLIST_VALIDATION_ERROR") {
    super(message);
    this.name = "ChecklistError";
  }
}
