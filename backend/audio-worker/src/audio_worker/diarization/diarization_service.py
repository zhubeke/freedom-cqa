from __future__ import annotations

from pathlib import Path
from audio_worker.models import Segment, AudioErrorCode, AudioPipelineError
from .model_loader import ModelLoader


def _segments(annotation, source_type: str, duration: float) -> list[Segment]:
    result: list[Segment] = []
    if annotation is None: return result
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        start, end = max(0.0, float(turn.start)), min(duration, float(turn.end))
        if end > start:
            result.append(Segment(speaker_id=str(speaker), start_seconds=start, end_seconds=end, duration_seconds=end-start, source_type=source_type))
    return sorted(result, key=lambda x: (x.start_seconds, x.end_seconds, x.speaker_id))


class DiarizationService:
    def __init__(self, loader: ModelLoader): self.loader = loader

    def analyze(self, path: Path, duration: float, *, min_speakers: int | None = None, max_speakers: int | None = None) -> tuple[list[Segment], list[Segment]]:
        pipeline = self.loader.load()
        hints = {k:v for k,v in {"min_speakers": min_speakers, "max_speakers": max_speakers}.items() if v is not None}
        try: output = pipeline(str(path), **hints)
        except Exception as exc: raise AudioPipelineError(AudioErrorCode.ANALYSIS_FAILED, "pyannote diarization failed") from exc
        ordinary = getattr(output, "speaker_diarization", output)
        exclusive = getattr(output, "exclusive_speaker_diarization", None)
        ordinary_segments = _segments(ordinary, "diarization", duration)
        exclusive_segments = _segments(exclusive or ordinary, "exclusive_diarization", duration)
        if not ordinary_segments: raise AudioPipelineError(AudioErrorCode.ANALYSIS_FAILED, "Diarization returned no speaker segments")
        return ordinary_segments, exclusive_segments
