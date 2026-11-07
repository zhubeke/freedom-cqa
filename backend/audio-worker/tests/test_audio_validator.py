from pathlib import Path
import pytest
from audio_worker.config import Settings
from audio_worker.ingestion import audio_validator
from audio_worker.models import AudioErrorCode, AudioPipelineError


def settings(**changes):
    base=dict(mongodb_uri="unused",mongodb_database="cqa",brokers="unused",consumer_group="test",allowed_audio_hosts=frozenset(),max_download_bytes=10,request_timeout_seconds=1)
    base.update(changes); return Settings(**base)


def test_empty_and_oversized_sources_have_distinct_codes(tmp_path:Path):
    empty=tmp_path/"empty"; empty.write_bytes(b"")
    with pytest.raises(AudioPipelineError) as absent: audio_validator.validate_audio(empty,settings())
    assert absent.value.code==AudioErrorCode.NOT_AVAILABLE
    large=tmp_path/"large"; large.write_bytes(b"x"*11)
    with pytest.raises(AudioPipelineError) as oversized: audio_validator.validate_audio(large,settings())
    assert oversized.value.code==AudioErrorCode.TOO_LARGE


def test_duration_limit_is_enforced_after_inspection(tmp_path:Path,monkeypatch):
    source=tmp_path/"source"; source.write_bytes(b"ok")
    monkeypatch.setattr(audio_validator,"inspect_audio",lambda _:{"duration_seconds":11})
    with pytest.raises(AudioPipelineError) as error: audio_validator.validate_audio(source,settings(max_duration_seconds=10))
    assert error.value.code==AudioErrorCode.TOO_LONG
