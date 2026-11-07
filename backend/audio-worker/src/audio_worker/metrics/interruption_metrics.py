from __future__ import annotations

from typing import Any
from audio_worker.models import OverlapSegment, Segment


def estimate_interruptions(segments: list[Segment], overlap_segments: list[OverlapSegment], minimum: float) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for overlap in overlap_segments:
        active = [s for s in segments if s.start_seconds < overlap.end_seconds and s.end_seconds > overlap.start_seconds]
        starters = sorted(active, key=lambda s: s.start_seconds)
        if len(starters) < 2: continue
        receiver, initiator = starters[0], starters[-1]
        overlap_duration = overlap.duration_seconds
        continuation = initiator.end_seconds - overlap.end_seconds
        receiver_stops_soon = receiver.end_seconds - initiator.start_seconds <= 1.0
        if overlap_duration >= minimum and continuation >= 0.2 and receiver_stops_soon:
            events.append({
                "start_seconds": overlap.start_seconds, "end_seconds": overlap.end_seconds,
                "duration_seconds": overlap_duration, "initiator_speaker_id": initiator.speaker_id,
                "recipient_speaker_id": receiver.speaker_id, "classification": "possible_interruption",
                "confidence": min(0.9, 0.5 + overlap_duration / 2), "evidence_overlap": overlap.model_dump()
            })
    return events
