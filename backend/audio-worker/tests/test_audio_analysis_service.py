from pathlib import Path
import numpy as np

from audio_worker.config import Settings
from audio_worker.services.audio_analysis_service import AudioAnalysisService


def settings(**changes):
    base=dict(mongodb_uri="unused",mongodb_database="cqa",brokers="unused",consumer_group="test",allowed_audio_hosts=frozenset({"media.example"}),max_download_bytes=1000,request_timeout_seconds=1)
    base.update(changes)
    return Settings(**base)


def test_analysis_fingerprint_is_stable_and_configuration_sensitive():
    one=AudioAnalysisService(settings(),None,None)
    two=AudioAnalysisService(settings(min_overlap_seconds=.4),None,None)
    assert one._fingerprint("abc")==one._fingerprint("abc")
    assert one._fingerprint("abc")!=one._fingerprint("def")
    assert one._fingerprint("abc")!=two._fingerprint("abc")


def test_mixed_audio_fallback_exposes_recording_metrics_without_fabricating_speakers():
    samples=np.zeros((16000,1),dtype=np.float32)
    metrics=AudioAnalysisService._mixed_recording_metrics(samples,16000)
    assert metrics["recording_duration_seconds"]==1.0
    assert metrics["detected_speaker_count"] is None
    assert metrics["total_overlap_seconds"] is None
    assert metrics["interruption_count_estimate"] is None
    assert "speaker attribution" in metrics["limitations"][0]
