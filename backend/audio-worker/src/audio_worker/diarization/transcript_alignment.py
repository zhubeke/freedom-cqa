from __future__ import annotations

from datetime import datetime
from typing import Any
from audio_worker.models import Segment, TranscriptAlignment


def _timestamp(value: str) -> datetime | None:
    try: return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError): return None


def align_transcript(transcript: list[dict[str, Any]], exclusive: list[Segment], duration: float) -> list[TranscriptAlignment]:
    spoken = [m for m in transcript if m.get("speaker") in {"client", "operator", "bot"}]
    parsed = [_timestamp(str(m.get("timestamp", ""))) for m in spoken]
    valid = [x for x in parsed if x is not None]
    if not valid:
        return [TranscriptAlignment(message_id=str(m.get("message_id","")), original_timestamp=str(m.get("timestamp","")), alignment_method="timestamp_unavailable", alignment_status="UNALIGNED") for m in transcript]
    system_events=[(m,_timestamp(str(m.get("timestamp",""))),str(m.get("text","")).lower()) for m in transcript if m.get("speaker")=="system"]
    starts=[stamp for _,stamp,text in system_events if stamp and (("запис" in text and "запущ" in text) or ("record" in text and "start" in text))]
    origin=min(starts) if starts else min(valid)
    pauses: list[tuple[datetime,datetime]]=[]; paused_at: datetime|None=None
    for _,stamp,text in system_events:
        if not stamp: continue
        if "приостанов" in text or ("record" in text and "paus" in text): paused_at=stamp
        elif paused_at and ("возобнов" in text or ("record" in text and "resum" in text)):
            if stamp>paused_at: pauses.append((paused_at,stamp))
            paused_at=None
    def elapsed(stamp:datetime)->float:
        raw=max(0.0,(stamp-origin).total_seconds())
        omitted=sum(max(0.0,(min(stamp,end)-max(origin,start)).total_seconds()) for start,end in pauses if stamp>start)
        return max(0.0,raw-omitted)
    timeline_span=max(elapsed(x) for x in valid)
    scale = 1.0 if timeline_span <= duration * 1.25 else duration / timeline_span if timeline_span else 1.0
    output: list[TranscriptAlignment] = []
    for message in transcript:
        stamp = _timestamp(str(message.get("timestamp", "")))
        role = str(message.get("speaker", ""))
        if stamp is None or role not in {"client", "operator", "bot"}:
            output.append(TranscriptAlignment(message_id=str(message.get("message_id","")), original_timestamp=str(message.get("timestamp","")), inferred_role=role or None, alignment_method="non_speech_or_invalid_timestamp", alignment_status="UNALIGNED"))
            continue
        offset = elapsed(stamp) * scale
        candidates = [s for s in exclusive if s.start_seconds <= offset <= s.end_seconds]
        if not candidates:
            candidates = sorted(exclusive, key=lambda s: min(abs(s.start_seconds-offset), abs(s.end_seconds-offset)))[:1]
        segment = candidates[0] if candidates else None
        distance = 0 if segment and segment.start_seconds <= offset <= segment.end_seconds else min(abs(segment.start_seconds-offset), abs(segment.end_seconds-offset)) if segment else duration
        confidence = max(0.0, min(1.0, (0.85 if scale == 1 else 0.65) - min(distance / 10, .5)))
        method="relative_timestamp_pause_adjusted" if pauses else "relative_timestamp"
        if scale != 1: method += "_scaled"
        output.append(TranscriptAlignment(message_id=str(message.get("message_id","")), original_timestamp=str(message.get("timestamp","")), audio_start_seconds=min(offset, duration), audio_end_seconds=segment.end_seconds if segment and confidence >= .55 else None, speaker_id=segment.speaker_id if segment else None, inferred_role=role, alignment_confidence=confidence, alignment_method=method, alignment_status="ALIGNED" if confidence >= .7 else "APPROXIMATE" if segment else "UNALIGNED"))
    return output
