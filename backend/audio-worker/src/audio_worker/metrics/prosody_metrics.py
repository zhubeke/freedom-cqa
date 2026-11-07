from __future__ import annotations

import librosa
import numpy as np


def prosody(samples: np.ndarray, sample_rate: int) -> dict[str, float | None]:
    if len(samples) < sample_rate // 2: return {"median_f0_hz": None, "f0_variability_hz": None, "voiced_frame_ratio": None}
    try:
        f0, voiced, _ = librosa.pyin(samples.astype(np.float32), fmin=65, fmax=500, sr=sample_rate)
        values = f0[np.isfinite(f0)]
        return {"median_f0_hz": float(np.median(values)) if values.size else None, "f0_variability_hz": float(np.std(values)) if values.size else None, "voiced_frame_ratio": float(np.mean(voiced)) if voiced is not None and len(voiced) else None}
    except Exception:
        return {"median_f0_hz": None, "f0_variability_hz": None, "voiced_frame_ratio": None}
