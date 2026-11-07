from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Any
import numpy as np

from audio_worker.models import Segment, SpeakerMetric
from .intervals import duration as union_duration, gaps
from .interruption_metrics import estimate_interruptions
from .loudness_metrics import loudness
from .overlap_metrics import overlaps
from .prosody_metrics import prosody
from .loudness_metrics import dbfs


def _samples_for(samples: np.ndarray, sample_rate: int, segments: list[Segment]) -> np.ndarray:
    parts = [samples[max(0, int(s.start_seconds*sample_rate)):min(len(samples), int(s.end_seconds*sample_rate))] for s in segments]
    return np.concatenate([x for x in parts if x.size]) if any(x.size for x in parts) else np.array([], dtype=np.float32)


def calculate_metrics(samples: np.ndarray, sample_rate: int, recording_duration: float, segments: list[Segment], minimum_overlap: float) -> tuple[dict[str, Any], list[SpeakerMetric], list, list]:
    speech = [(s.start_seconds, s.end_seconds) for s in segments]
    speech_seconds = union_duration(speech)
    silences = gaps(speech, recording_duration)
    silence_lengths = [b-a for a,b in silences]
    overlap_segments, overlap_seconds = overlaps(segments, minimum_overlap)
    interruption_events = estimate_interruptions(segments, overlap_segments, minimum_overlap)
    chunks = np.array_split(samples, min(240, max(1, len(samples) // max(1, sample_rate))))
    energy_timeline = [{"time_seconds": index * recording_duration / len(chunks), "rms_dbfs": dbfs(float(np.sqrt(np.mean(np.square(chunk.astype(np.float64))))))} for index, chunk in enumerate(chunks) if chunk.size]
    recording = {
        "recording_duration_seconds": recording_duration, "sample_rate_hz": sample_rate,
        "detected_speaker_count": len({s.speaker_id for s in segments}), "total_speech_seconds": speech_seconds,
        "total_silence_seconds": sum(silence_lengths), "speech_ratio": speech_seconds/recording_duration if recording_duration else 0,
        "silence_ratio": sum(silence_lengths)/recording_duration if recording_duration else 0, "total_overlap_seconds": overlap_seconds,
        "overlap_ratio": overlap_seconds/recording_duration if recording_duration else 0,
        "longest_silence_seconds": max(silence_lengths, default=0), "average_silence_seconds": statistics.mean(silence_lengths) if silence_lengths else 0,
        "median_silence_seconds": statistics.median(silence_lengths) if silence_lengths else 0, "speech_segment_count": len(segments),
        "pauses_over_1_second": sum(x>1 for x in silence_lengths), "pauses_over_3_seconds": sum(x>3 for x in silence_lengths),
        "pauses_over_5_seconds": sum(x>5 for x in silence_lengths), "interruption_count_estimate": len(interruption_events),
        "silence_distribution_seconds": silence_lengths, "energy_timeline": energy_timeline, **loudness(samples, sample_rate), **prosody(samples, sample_rate)
    }
    grouped: dict[str, list[Segment]] = defaultdict(list)
    for segment in segments: grouped[segment.speaker_id].append(segment)
    speaker_metrics: list[SpeakerMetric] = []
    for speaker_id, items in sorted(grouped.items()):
        items.sort(key=lambda x: x.start_seconds)
        turns = [x.duration_seconds for x in items]
        pauses = [b.start_seconds-a.end_seconds for a,b in zip(items, items[1:]) if b.start_seconds > a.end_seconds]
        signal = _samples_for(samples, sample_rate, items)
        sm_loudness = loudness(signal, sample_rate); sm_prosody = prosody(signal, sample_rate)
        overlap_involvement = union_duration((x.start_seconds, x.end_seconds) for x in overlap_segments if speaker_id in x.speaker_ids)
        speaker_metrics.append(SpeakerMetric(
            speaker_id=speaker_id, total_speaking_seconds=sum(turns), speaking_ratio=sum(turns)/recording_duration if recording_duration else 0,
            speech_segment_count=len(items), average_turn_seconds=statistics.mean(turns), median_turn_seconds=statistics.median(turns),
            longest_turn_seconds=max(turns), shortest_turn_seconds=min(turns), average_pause_seconds=statistics.mean(pauses) if pauses else None,
            longest_pause_seconds=max(pauses) if pauses else None, rms_dbfs=sm_loudness["rms_dbfs"], peak_dbfs=sm_loudness["peak_dbfs"],
            loudness_variability=sm_loudness["loudness_variability"], overlap_involvement_seconds=overlap_involvement,
            interruption_initiations_estimate=sum(e["initiator_speaker_id"]==speaker_id for e in interruption_events),
            interruption_receipts_estimate=sum(e["recipient_speaker_id"]==speaker_id for e in interruption_events), **sm_prosody
        ))
    return recording, speaker_metrics, overlap_segments, interruption_events
