from __future__ import annotations

from audio_worker.models import OverlapSegment, Segment
from .intervals import duration


def overlaps(segments: list[Segment], minimum: float) -> tuple[list[OverlapSegment], float]:
    points = sorted({x for s in segments for x in (s.start_seconds, s.end_seconds)})
    result: list[OverlapSegment] = []
    for start, end in zip(points, points[1:]):
        speakers = sorted({s.speaker_id for s in segments if s.start_seconds < end and s.end_seconds > start})
        if len(speakers) > 1 and end - start >= minimum:
            if result and result[-1].speaker_ids == speakers and abs(result[-1].end_seconds - start) < 1e-6:
                previous = result[-1]
                result[-1] = OverlapSegment(start_seconds=previous.start_seconds, end_seconds=end, duration_seconds=end - previous.start_seconds, speaker_ids=speakers)
            else:
                result.append(OverlapSegment(start_seconds=start, end_seconds=end, duration_seconds=end-start, speaker_ids=speakers))
    return result, duration((x.start_seconds, x.end_seconds) for x in result)
