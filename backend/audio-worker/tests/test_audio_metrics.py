import numpy as np
import pytest

from audio_worker.metrics.aggregate_metrics import calculate_metrics
from audio_worker.metrics.intervals import duration, gaps, union
from audio_worker.metrics.loudness_metrics import dbfs
from audio_worker.models import Segment


def segment(speaker, start, end):
    return Segment(speaker_id=speaker, start_seconds=start, end_seconds=end, duration_seconds=end-start, source_type="diarization")


def test_interval_union_does_not_double_count_speech_or_overlap():
    assert union([(0, 2), (1, 3), (4, 5)]) == [(0, 3), (4, 5)]
    assert duration([(0, 2), (1, 3)]) == 3
    assert gaps([(1, 2), (4, 5)], 6) == [(0, 1), (2, 4), (5, 6)]


def test_recording_and_speaker_metrics_use_real_samples():
    rate=16000; samples=np.full(rate*4, .5, dtype=np.float32)
    recording, speakers, overlap, interruptions=calculate_metrics(samples,rate,4,[segment("SPEAKER_00",0,2),segment("SPEAKER_01",1.5,3)],.1)
    assert recording["total_speech_seconds"] == pytest.approx(3)
    assert recording["total_overlap_seconds"] == pytest.approx(.5)
    assert recording["detected_speaker_count"] == 2
    assert len(speakers) == 2 and speakers[0].rms_dbfs == pytest.approx(dbfs(.5),abs=.1)
    assert overlap[0].speaker_ids == ["SPEAKER_00","SPEAKER_01"]
    assert isinstance(interruptions,list)


def test_dbfs_has_explicit_silence_floor_policy():
    assert dbfs(0) is None
    assert dbfs(1) == pytest.approx(0)
