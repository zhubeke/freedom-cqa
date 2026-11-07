from pathlib import Path

import pytest

from audio_worker.config import Settings
from audio_worker.downloader import AudioDownloadError, download_audio


def test_unavailable_host_is_rejected_without_metrics(tmp_path: Path):
    settings = Settings("mongodb://unused", "cqa", "unused:9092", "test", frozenset({"media.example.com"}), 1024, 1)
    with pytest.raises(AudioDownloadError, match="not permitted"):
        download_audio("https://untrusted.example/audio.wav?sig=secret", tmp_path / "audio", settings)
    assert not (tmp_path / "audio").exists()
