from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mongodb_uri: str
    mongodb_database: str
    brokers: str
    consumer_group: str
    allowed_audio_hosts: frozenset[str]
    max_download_bytes: int
    download_timeout_seconds: float
    max_redirects: int = 5
    media_resolution_attempts: int = 3
    requested_topic: str = "cqa.audio.requested.v1"
    analyzed_topic: str = "cqa.audio.analyzed.v1"
    processor_version: str = "audio-v1"

    @classmethod
    def from_env(cls) -> "Settings":
        required = ("MONGODB_URI", "MONGODB_DATABASE", "REDPANDA_BROKERS")
        missing = [name for name in required if not os.getenv(name, "").strip()]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
        hosts = os.getenv("CQA_AUDIO_ALLOWED_HOSTS", "").split(",")
        allowed = frozenset(host.strip().lower() for host in hosts if host.strip())
        if not allowed:
            raise RuntimeError("CQA_AUDIO_ALLOWED_HOSTS must list at least one permitted host")
        return cls(
            mongodb_uri=os.environ["MONGODB_URI"],
            mongodb_database=os.environ["MONGODB_DATABASE"],
            brokers=os.environ["REDPANDA_BROKERS"],
            consumer_group=os.getenv("CQA_AUDIO_CONSUMER_GROUP", "cqa-audio-worker-v1"),
            allowed_audio_hosts=allowed,
            max_download_bytes=int(os.getenv("CQA_AUDIO_MAX_DOWNLOAD_BYTES", str(100 * 1024 * 1024))),
            download_timeout_seconds=float(os.getenv("CQA_AUDIO_DOWNLOAD_TIMEOUT_SECONDS", "30")),
            max_redirects=int(os.getenv("CQA_AUDIO_MAX_REDIRECTS", "5")),
            media_resolution_attempts=int(os.getenv("CQA_AUDIO_MEDIA_RESOLUTION_ATTEMPTS", "3")),
        )

