from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any
import numpy as np
import soundfile as sf

from .models import AudioErrorCode, AudioPipelineError


class AudioDecodeError(AudioPipelineError):
    def __init__(self, message: str):
        super().__init__(AudioErrorCode.DECODE_FAILED, message)


def inspect_audio(source: Path) -> dict[str, Any]:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,format_name,size:stream=codec_name,sample_rate,channels", "-of", "json", str(source)], capture_output=True, text=True, timeout=30, check=False)
    if result.returncode != 0: raise AudioDecodeError("ffprobe could not inspect the audio source")
    try:
        data = json.loads(result.stdout); stream = next(x for x in data.get("streams", []) if x.get("codec_name"))
        return {"duration_seconds": float(data["format"]["duration"]), "format": data["format"].get("format_name"), "codec": stream.get("codec_name"), "original_sample_rate_hz": int(stream.get("sample_rate") or 0), "original_channel_count": int(stream.get("channels") or 0), "source_bytes": int(data["format"].get("size") or source.stat().st_size)}
    except (ValueError, KeyError, StopIteration, TypeError) as exc: raise AudioDecodeError("Audio metadata was incomplete or unsupported") from exc


def decode_audio(source: Path, decoded: Path) -> tuple[np.ndarray, int, int]:
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", str(decoded)], capture_output=True, text=True, timeout=300, check=False)
    if result.returncode != 0: raise AudioDecodeError("ffmpeg could not decode the downloaded media")
    try: samples, sample_rate = sf.read(decoded, dtype="float32", always_2d=True)
    except (RuntimeError, ValueError) as exc: raise AudioDecodeError("Decoded audio could not be read") from exc
    if samples.size == 0 or sample_rate <= 0: raise AudioDecodeError("Decoded audio is empty")
    return samples, sample_rate, samples.shape[1]


def decode_raw_audio(source: Path, decoded: Path) -> tuple[np.ndarray, int, int]:
    result = subprocess.run(["ffmpeg","-v","error","-nostdin","-y","-i",str(source),"-vn","-acodec","pcm_f32le",str(decoded)],capture_output=True,text=True,timeout=300,check=False)
    if result.returncode != 0: raise AudioDecodeError("ffmpeg could not decode the original signal view")
    try: samples,sample_rate=sf.read(decoded,dtype="float32",always_2d=True)
    except (RuntimeError,ValueError) as exc: raise AudioDecodeError("Original decoded signal could not be read") from exc
    if samples.size==0 or sample_rate<=0: raise AudioDecodeError("Original decoded signal is empty")
    return samples,sample_rate,samples.shape[1]
