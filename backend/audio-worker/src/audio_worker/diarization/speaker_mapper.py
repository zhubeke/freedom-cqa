from __future__ import annotations

from collections import defaultdict
from audio_worker.models import SpeakerMetric, TranscriptAlignment


def map_speakers(alignments: list[TranscriptAlignment], threshold: float) -> dict[str, dict]:
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for item in alignments:
        if item.speaker_id and item.inferred_role in {"client", "operator", "bot"}:
            votes[item.speaker_id][item.inferred_role] += item.alignment_confidence
    result = {}
    for speaker, role_votes in votes.items():
        total = sum(role_votes.values()); role, score = max(role_votes.items(), key=lambda x: x[1])
        confidence = score / total if total else 0
        result[speaker] = {"inferred_role": role if confidence >= threshold else "unknown", "confidence": confidence, "evidence_weight": total}
    return result


def apply_mapping(metrics: list[SpeakerMetric], mapping: dict[str, dict]) -> dict[str, dict]:
    summary: dict[str, dict] = {}
    for item in metrics:
        mapped = mapping.get(item.speaker_id, {"inferred_role": "unknown", "confidence": 0})
        item.inferred_role = mapped["inferred_role"]; item.role_mapping_confidence = mapped["confidence"]
        role = item.inferred_role
        target = summary.setdefault(role, {"speaking_time_seconds": 0.0, "speech_segment_count": 0, "speaker_ids": [], "overlap_involvement_seconds": 0.0, "interruption_initiations_estimate": 0, "interruption_receipts_estimate": 0})
        target["speaking_time_seconds"] += item.total_speaking_seconds; target["speech_segment_count"] += item.speech_segment_count
        target["speaker_ids"].append(item.speaker_id); target["overlap_involvement_seconds"] += item.overlap_involvement_seconds
        target["interruption_initiations_estimate"] += item.interruption_initiations_estimate; target["interruption_receipts_estimate"] += item.interruption_receipts_estimate
    return summary
