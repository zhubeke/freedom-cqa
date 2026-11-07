from __future__ import annotations

import math
import numpy as np

FLOOR_DBFS = -120.0


def dbfs(value: float) -> float | None:
    return None if value <= 1e-12 else max(FLOOR_DBFS, float(20 * math.log10(value)))


def loudness(samples: np.ndarray, sample_rate: int) -> dict[str, float | None]:
    if not samples.size: return {"rms_dbfs": None, "peak_dbfs": None, "mean_frame_energy": None, "energy_standard_deviation": None, "loudness_variability": None, "loudness_change_db": None, "high_energy_segment_ratio": None}
    mono = samples.astype(np.float64)
    rms = float(np.sqrt(np.mean(np.square(mono))))
    peak = float(np.max(np.abs(mono)))
    size = max(1, int(sample_rate * .05))
    energies = np.array([np.mean(np.square(mono[i:i+size])) for i in range(0, len(mono), size)])
    frame_db = np.array([dbfs(float(np.sqrt(e))) or FLOOR_DBFS for e in energies])
    return {
        "rms_dbfs": dbfs(rms), "peak_dbfs": dbfs(peak), "mean_frame_energy": float(np.mean(energies)),
        "energy_standard_deviation": float(np.std(energies)), "loudness_variability": float(np.std(frame_db)),
        "loudness_change_db": float(frame_db[-1] - frame_db[0]) if len(frame_db) > 1 else 0.0,
        "high_energy_segment_ratio": float(np.mean(energies > np.percentile(energies, 75))) if len(energies) else None,
    }
