from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    mongodb_uri: str
    mongodb_database: str
    brokers: str
    consumer_group: str
    allowed_audio_hosts: frozenset[str]
    max_download_bytes: int
    request_timeout_seconds: float
    max_redirects: int = 5
    max_retries: int = 2
    media_resolution_attempts: int | None = None
    requested_topic: str = "cqa.audio.requested.v1"
    analyzed_topic: str = "cqa.audio.analyzed.v1"
    dead_letter_topic: str = "cqa.audio.dead-letter.v1"
    analyzer_version: str = "cqa-audio-2.0.0"
    schema_version: str = "audio-analysis.v2"
    enabled: bool = True
    model_id: str = "pyannote/speaker-diarization-community-1"
    model_revision: str = "main"
    device: str = "cpu"
    model_cache_dir: Path = Path("/models/huggingface")
    temp_dir: Path = Path("/tmp/cqa-audio")
    local_audio_dir: Path = Path("/var/lib/cqa-audio")
    max_duration_seconds: float = 14_400
    min_overlap_seconds: float = 0.15
    alignment_confidence_threshold: float = 0.55
    torch_threads: int = 2

    @property
    def hf_token(self) -> str | None:
        return os.getenv("HF_TOKEN") or None

    @classmethod
    def from_env(cls) -> "Settings":
        required = ("MONGODB_URI", "MONGODB_DATABASE", "REDPANDA_BROKERS")
        missing = [name for name in required if not os.getenv(name, "").strip()]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
        hosts = frozenset(x.strip().lower() for x in os.getenv("CQA_AUDIO_ALLOWED_HOSTS", "").split(",") if x.strip())
        return cls(
            mongodb_uri=os.environ["MONGODB_URI"], mongodb_database=os.environ["MONGODB_DATABASE"],
            brokers=os.environ["REDPANDA_BROKERS"], consumer_group=os.getenv("CQA_AUDIO_CONSUMER_GROUP", "cqa-audio-worker-v2"),
            allowed_audio_hosts=hosts, max_download_bytes=int(os.getenv("CQA_AUDIO_MAX_DOWNLOAD_BYTES", str(100 * 1024 * 1024))),
            request_timeout_seconds=float(os.getenv("CQA_AUDIO_REQUEST_TIMEOUT_SECONDS", "30")),
            max_redirects=int(os.getenv("CQA_AUDIO_MAX_REDIRECTS", "5")), max_retries=int(os.getenv("CQA_AUDIO_MAX_RETRIES", "2")),
            enabled=_bool("CQA_AUDIO_ENABLED", True), model_id=os.getenv("CQA_AUDIO_MODEL_ID", "pyannote/speaker-diarization-community-1"),
            model_revision=os.getenv("CQA_AUDIO_MODEL_REVISION", "main"), device=os.getenv("CQA_AUDIO_DEVICE", "cpu"),
            model_cache_dir=Path(os.getenv("CQA_AUDIO_MODEL_CACHE_DIR", os.getenv("HF_HOME", "/models/huggingface"))),
            temp_dir=Path(os.getenv("CQA_AUDIO_TEMP_DIR", "/tmp/cqa-audio")),
            local_audio_dir=Path(os.getenv("CQA_AUDIO_LOCAL_DIR", "/var/lib/cqa-audio")),
            max_duration_seconds=float(os.getenv("CQA_AUDIO_MAX_DURATION_SECONDS", "14400")),
            min_overlap_seconds=float(os.getenv("CQA_AUDIO_MIN_OVERLAP_SECONDS", "0.15")),
            alignment_confidence_threshold=float(os.getenv("CQA_AUDIO_ALIGNMENT_CONFIDENCE_THRESHOLD", "0.55")),
            torch_threads=max(1, int(os.getenv("CQA_AUDIO_TORCH_THREADS", "2"))),
        )
