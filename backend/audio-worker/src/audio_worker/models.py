from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AudioRequestedEvent(BaseModel):
    event_id: str
    dataset_group_id: str
    conversation_id: str
    processor_version: str = "audio-v1"


class AudioMetrics(BaseModel):
    dataset_group_id: str
    conversation_id: str
    processor_version: str
    status: str = "completed"
    duration_seconds: float
    sample_rate: int
    channel_count: int
    speech_duration_seconds: float
    silence_duration_seconds: float
    silence_ratio: float
    speech_segment_count: int
    longest_silence_seconds: float
    rms_dbfs: float | None
    peak_dbfs: float | None
    loudness_variability: float | None
    speech_activity_ratio: float
    interruption_count: None = None
    client_speaking_time_seconds: None = None
    operator_speaking_time_seconds: None = None
    limitations: list[str] = Field(default_factory=list)
    error: None = None
    processed_at: datetime

