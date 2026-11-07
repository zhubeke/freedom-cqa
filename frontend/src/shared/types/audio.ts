export type AudioAnalysisStatus = "not_analyzed" | "queued" | "processing" | "completed" | "partial" | "unavailable" | "failed" | "publish_failed";
export interface AudioSegment { speaker_id: string; start_seconds: number; end_seconds: number; duration_seconds: number; source_type: string; mapping_confidence?: number | null }
export interface AudioOverlap { start_seconds: number; end_seconds: number; duration_seconds: number; speaker_ids: string[] }
export interface SpeakerAudioMetrics {
  speaker_id: string; inferred_role: "client" | "operator" | "bot" | "unknown"; role_mapping_confidence: number;
  total_speaking_seconds: number; speaking_ratio: number; speech_segment_count: number; average_turn_seconds: number;
  longest_pause_seconds: number | null; rms_dbfs: number | null; peak_dbfs: number | null;
  overlap_involvement_seconds: number; interruption_initiations_estimate: number; interruption_receipts_estimate: number;
}
export interface AudioAnalysis {
  status: AudioAnalysisStatus; analysis_run_id?: string; model_id?: string; model_revision?: string; error_code?: string;
  recording_metrics?: Record<string, number | number[] | Array<{ time_seconds: number; rms_dbfs: number | null }> | null>; speaker_metrics?: SpeakerAudioMetrics[];
  diarization_segments?: AudioSegment[]; exclusive_diarization_segments?: AudioSegment[]; overlap_segments?: AudioOverlap[];
  interruption_events?: Array<Record<string, unknown>>; role_summary?: Record<string, unknown>;
  quality_indicators?: { alignment_confidence?: number | null; alignment_coverage?: number; role_mapping_uncertain?: boolean; dBFS_is_uncalibrated?: boolean };
}
