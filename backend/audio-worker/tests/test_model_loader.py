import sys
import types
import pytest
from audio_worker.config import Settings
from audio_worker.diarization.model_loader import ModelLoader
from audio_worker.models import AudioErrorCode, AudioPipelineError


def test_missing_or_unauthorized_model_is_explicit(monkeypatch):
    torch=types.ModuleType("torch"); torch.set_num_threads=lambda _:None; torch.device=lambda x:x
    audio=types.ModuleType("pyannote.audio")
    class Pipeline:
        @staticmethod
        def from_pretrained(*_args,**_kwargs): raise PermissionError("token redacted")
    audio.Pipeline=Pipeline
    pyannote=types.ModuleType("pyannote"); pyannote.audio=audio
    monkeypatch.setitem(sys.modules,"torch",torch); monkeypatch.setitem(sys.modules,"pyannote",pyannote); monkeypatch.setitem(sys.modules,"pyannote.audio",audio)
    settings=Settings("unused","cqa","unused","test",frozenset(),1000,1)
    with pytest.raises(AudioPipelineError) as error: ModelLoader(settings).load()
    assert error.value.code==AudioErrorCode.MODEL_UNAVAILABLE
    assert "token redacted" not in str(error.value)
