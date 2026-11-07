from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AudioErrorCode(StrEnum):
    NOT_AVAILABLE = "AUDIO_NOT_AVAILABLE"
    URL_EXPIRED = "AUDIO_URL_EXPIRED"
    ACCESS_DENIED = "AUDIO_ACCESS_DENIED"
    DOWNLOAD_FAILED = "AUDIO_DOWNLOAD_FAILED"
    UNSUPPORTED_FORMAT = "AUDIO_UNSUPPORTED_FORMAT"
    DECODE_FAILED = "AUDIO_DECODE_FAILED"
    TOO_LARGE = "AUDIO_TOO_LARGE"
    TOO_LONG = "AUDIO_TOO_LONG"
    MODEL_UNAVAILABLE = "AUDIO_MODEL_UNAVAILABLE"
    ANALYSIS_FAILED = "AUDIO_ANALYSIS_FAILED"


class AudioPipelineError(RuntimeError):
    def __init__(self, code: AudioErrorCode, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class AudioRequestedEvent(BaseModel):
    event_id: str
    event_type: str = "cqa.audio.requested"
    event_version: int = 1
    occurred_at: datetime | None = None
    correlation_id: str | None = None
    dataset_group_id: str
    conversation_id: str
    analysis_run_id: str | None = None
    audio_reference: str | None = None
    force_reanalysis: bool = False
    processor_version: str | None = None


class Segment(BaseModel):
    speaker_id: str
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    source_type: Literal["diarization", "exclusive_diarization"]
    mapping_confidence: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def valid_bounds(self):
        if self.end_seconds < self.start_seconds:
            raise ValueError("segment end precedes start")
        return self


class OverlapSegment(BaseModel):
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    speaker_ids: list[str]


class TranscriptAlignment(BaseModel):
    message_id: str
    original_timestamp: str
    audio_start_seconds: float | None = None
    audio_end_seconds: float | None = None
    speaker_id: str | None = None
    inferred_role: str | None = None
    alignment_confidence: float = 0
    alignment_method: str
    alignment_status: Literal["ALIGNED", "APPROXIMATE", "UNALIGNED"]


class SpeakerMetric(BaseModel):
    speaker_id: str
    inferred_role: str = "unknown"
    role_mapping_confidence: float = 0
    total_speaking_seconds: float
    speaking_ratio: float
    speech_segment_count: int
    average_turn_seconds: float
    median_turn_seconds: float
    longest_turn_seconds: float
    shortest_turn_seconds: float
    average_pause_seconds: float | None = None
    longest_pause_seconds: float | None = None
    rms_dbfs: float | None = None
    peak_dbfs: float | None = None
    loudness_variability: float | None = None
    median_f0_hz: float | None = None
    f0_variability_hz: float | None = None
    voiced_frame_ratio: float | None = None
    overlap_involvement_seconds: float = 0
    interruption_initiations_estimate: int = 0
    interruption_receipts_estimate: int = 0


class AudioAnalysisResult(BaseModel):
    dataset_group_id: str
    conversation_id: str
    analysis_run_id: str
    status: Literal["completed", "partial"] = "completed"
    schema_version: str
    source_audio_hash: str
    source_audio_reference: str
    analysis_fingerprint: str
    model_id: str
    model_revision: str
    analyzer_version: str
    processing_started_at: datetime
    processing_completed_at: datetime
    audio_metadata: dict[str, Any]
    recording_metrics: dict[str, Any]
    speaker_metrics: list[SpeakerMetric]
    role_summary: dict[str, Any] = Field(default_factory=dict)
    diarization_segments: list[Segment]
    exclusive_diarization_segments: list[Segment]
    overlap_segments: list[OverlapSegment]
    interruption_events: list[dict[str, Any]]
    transcript_alignments: list[TranscriptAlignment]
    role_mapping: dict[str, Any]
    quality_indicators: dict[str, Any]
    processing_statistics: dict[str, Any]
    errors: list[dict[str, Any]] = Field(default_factory=list)
