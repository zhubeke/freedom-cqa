from __future__ import annotations

import math

import librosa
import numpy as np


def _dbfs(value: float) -> float | None:
    return None if value <= 0 else float(20 * math.log10(value))


def analyze(samples: np.ndarray, sample_rate: int) -> dict[str, float | int | None | list[str]]:
    mono = np.mean(samples, axis=1).astype(np.float32)
    duration = len(mono) / sample_rate
    frame_samples = max(1, int(sample_rate * 0.03))
    frame_seconds = frame_samples / sample_rate
    flags = [float(np.sqrt(np.mean(np.square(mono[start:start+frame_samples], dtype=np.float64)))) > 1e-4 for start in range(0, len(mono)-frame_samples+1, frame_samples)]
    speech_duration = sum(flags) * frame_seconds
    silence_duration = max(0.0, duration - speech_duration)
    speech_segments = sum(flag and (index == 0 or not flags[index - 1]) for index, flag in enumerate(flags))
    longest_silence_frames = current = 0
    for flag in flags:
        current = 0 if flag else current + 1
        longest_silence_frames = max(longest_silence_frames, current)
    rms = float(np.sqrt(np.mean(np.square(mono, dtype=np.float64))))
    peak = float(np.max(np.abs(mono)))
    frame_length = max(1, int(sample_rate * 0.05))
    frame_rms = [float(np.sqrt(np.mean(np.square(mono[i:i + frame_length], dtype=np.float64)))) for i in range(0, len(mono), frame_length) if len(mono[i:i + frame_length])]
    frame_db = [value for item in frame_rms if (value := _dbfs(item)) is not None]
    ratio = speech_duration / duration if duration else 0.0
    return {
        "duration_seconds": duration,
        "speech_duration_seconds": min(duration, speech_duration),
        "silence_duration_seconds": silence_duration,
        "silence_ratio": silence_duration / duration if duration else 0.0,
        "speech_segment_count": speech_segments,
        "longest_silence_seconds": longest_silence_frames * frame_seconds,
        "rms_dbfs": _dbfs(rms),
        "peak_dbfs": _dbfs(peak),
        "loudness_variability": float(np.std(frame_db)) if frame_db else None,
        "speech_activity_ratio": ratio,
        "limitations": ["Mixed audio has no reliable speaker attribution; interruption counts and per-speaker metrics are unavailable."],
    }

