from pathlib import Path
from audio_worker.config import Settings
from audio_worker.decoder import inspect_audio
from audio_worker.models import AudioErrorCode, AudioPipelineError


def validate_audio(source: Path, settings: Settings) -> dict:
    if not source.is_file() or source.stat().st_size == 0: raise AudioPipelineError(AudioErrorCode.NOT_AVAILABLE, "Audio file is empty")
    if source.stat().st_size > settings.max_download_bytes: raise AudioPipelineError(AudioErrorCode.TOO_LARGE, "Audio exceeds maximum download size")
    metadata = inspect_audio(source)
    if metadata["duration_seconds"] > settings.max_duration_seconds: raise AudioPipelineError(AudioErrorCode.TOO_LONG, "Audio exceeds maximum duration")
    return metadata
