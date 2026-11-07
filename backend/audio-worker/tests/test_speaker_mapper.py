from audio_worker.diarization.speaker_mapper import apply_mapping, map_speakers
from audio_worker.models import SpeakerMetric, TranscriptAlignment


def alignment(speaker,role,confidence):
    return TranscriptAlignment(message_id="m",original_timestamp="2025-01-01T00:00:00Z",speaker_id=speaker,inferred_role=role,alignment_confidence=confidence,alignment_method="test",alignment_status="ALIGNED")


def test_mapping_keeps_multiple_operator_speakers_distinct():
    mapping=map_speakers([alignment("S0","operator",.9),alignment("S1","operator",.8)],.55)
    assert mapping["S0"]["inferred_role"] == mapping["S1"]["inferred_role"] == "operator"
    assert set(mapping) == {"S0","S1"}


def test_ambiguous_role_stays_unknown():
    mapping=map_speakers([alignment("S0","client",.6),alignment("S0","operator",.6)],.75)
    assert mapping["S0"]["inferred_role"] == "unknown"
