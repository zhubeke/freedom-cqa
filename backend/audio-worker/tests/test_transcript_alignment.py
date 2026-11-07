from audio_worker.diarization.transcript_alignment import align_transcript
from audio_worker.models import Segment


def test_timestamp_alignment_scales_impossible_wall_clock_span():
    exclusive=[Segment(speaker_id="SPEAKER_00",start_seconds=0,end_seconds=5,duration_seconds=5,source_type="exclusive_diarization")]
    transcript=[
        {"message_id":"m1","timestamp":"2025-01-01T10:00:00+05:00","speaker":"client"},
        {"message_id":"m2","timestamp":"2025-01-01T10:10:00+05:00","speaker":"operator"},
        {"message_id":"m3","timestamp":"2025-01-01T10:11:00+05:00","speaker":"system"},
    ]
    aligned=align_transcript(transcript,exclusive,5)
    assert aligned[0].alignment_method == "relative_timestamp_scaled"
    assert aligned[2].alignment_status == "UNALIGNED"
    assert all(item.original_timestamp for item in aligned)


def test_recording_pause_is_removed_not_counted_as_silence():
    exclusive=[Segment(speaker_id="SPEAKER_00",start_seconds=0,end_seconds=30,duration_seconds=30,source_type="exclusive_diarization")]
    transcript=[
        {"message_id":"s0","timestamp":"2025-01-01T10:00:00+00:00","speaker":"system","text":"Запись и транскрибирование запущены."},
        {"message_id":"m1","timestamp":"2025-01-01T10:00:05+00:00","speaker":"client","text":"one"},
        {"message_id":"s1","timestamp":"2025-01-01T10:00:10+00:00","speaker":"system","text":"Запись и транскрибирование приостановлены."},
        {"message_id":"s2","timestamp":"2025-01-01T10:01:10+00:00","speaker":"system","text":"Запись и транскрибирование возобновлены."},
        {"message_id":"m2","timestamp":"2025-01-01T10:01:15+00:00","speaker":"operator","text":"two"},
    ]
    aligned=align_transcript(transcript,exclusive,30)
    assert aligned[-1].audio_start_seconds == 15
    assert aligned[-1].alignment_method == "relative_timestamp_pause_adjusted"
