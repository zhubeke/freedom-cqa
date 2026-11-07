import os
from pathlib import Path
import pytest
from audio_worker.config import Settings
from audio_worker.diarization import DiarizationService, ModelLoader


@pytest.mark.real_model
def test_cached_community_model_on_cpu():
    fixture=os.getenv("CQA_REAL_AUDIO_FIXTURE")
    if not fixture: pytest.skip("CQA_REAL_AUDIO_FIXTURE is not configured")
    settings=Settings.from_env(); loader=ModelLoader(settings)
    if not loader.cache_available(): pytest.skip("Community-1 model is not cached")
    ordinary,exclusive=DiarizationService(loader).analyze(Path(fixture),60)
    assert loader.loaded and ordinary and exclusive
    assert all(0 <= item.start_seconds < item.end_seconds <= 60 for item in ordinary)
