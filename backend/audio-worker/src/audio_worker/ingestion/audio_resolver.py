from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from urllib.parse import urlparse
from audio_worker.config import Settings
from audio_worker.downloader import download_audio
from audio_worker.models import AudioErrorCode, AudioPipelineError


def resolve_audio(reference: str, destination: Path, settings: Settings) -> tuple[Path, str]:
    parsed = urlparse(reference)
    if parsed.scheme in {"http", "https"}:
        download_audio(reference, destination, settings)
    else:
        source = Path(parsed.path if parsed.scheme == "file" else reference)
        if not source.is_absolute() or not source.is_file(): raise AudioPipelineError(AudioErrorCode.NOT_AVAILABLE, "Local audio file does not exist")
        try: source.resolve().relative_to(settings.local_audio_dir.resolve())
        except ValueError as exc: raise AudioPipelineError(AudioErrorCode.ACCESS_DENIED, "Local audio path is outside the managed audio directory") from exc
        shutil.copyfile(source, destination)
    digest = hashlib.sha256()
    with destination.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""): digest.update(block)
    return destination, digest.hexdigest()
