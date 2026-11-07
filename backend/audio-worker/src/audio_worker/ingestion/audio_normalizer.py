from pathlib import Path
import numpy as np
from audio_worker.decoder import decode_audio


def normalize_audio(source: Path, destination: Path) -> tuple[np.ndarray, int]:
    samples, rate, _ = decode_audio(source, destination)
    return np.mean(samples, axis=1).astype(np.float32), rate
