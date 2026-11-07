export const ORGANIZER_CRITERION_IDS = ["contact", "discovery", "identification", "consultation", "empathy", "dialogue", "closure", "critical"] as const;
export type OrganizerCriterionId = typeof ORGANIZER_CRITERION_IDS[number];
export interface OrganizerCriterion { criterion_id: OrganizerCriterionId; value: boolean | number | null; rationale: string; evidence_turns: number[] }
export interface OrganizerSuccess { conversation_id: string; status: "ok"; criteria: OrganizerCriterion[]; score: { final_score: number; critical_flag: boolean } }
export interface OrganizerFailure { conversation_id: string; status: "error"; criteria: []; score: null; error: string }
export interface OrganizerResults { schema_version: "1.0"; team_name: string; model: { mode: "external_api"; name: string }; results: Array<OrganizerSuccess | OrganizerFailure> }
