from pathlib import Path
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
