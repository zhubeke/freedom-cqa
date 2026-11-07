from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


class AudioDecodeError(RuntimeError):
    pass


def decode_audio(source: Path, decoded: Path) -> tuple[np.ndarray, int, int]:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-vn", "-acodec", "pcm_f32le", str(decoded)],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if result.returncode != 0:
        raise AudioDecodeError("ffmpeg could not decode the downloaded media")
    try:
        samples, sample_rate = sf.read(decoded, dtype="float32", always_2d=True)
    except (RuntimeError, ValueError) as exc:
        raise AudioDecodeError("Decoded audio could not be read") from exc
    if samples.size == 0 or sample_rate <= 0:
        raise AudioDecodeError("Decoded audio is empty")
    return samples, sample_rate, samples.shape[1]

