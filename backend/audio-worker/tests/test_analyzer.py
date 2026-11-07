import numpy as np

from audio_worker.analyzer import analyze


def test_silence_has_no_fabricated_speaker_metrics():
    samples = np.zeros((16000, 1), dtype=np.float32)
    result = analyze(samples, 16000)
    assert result["duration_seconds"] == 1.0
    assert result["speech_duration_seconds"] == 0.0
    assert result["rms_dbfs"] is None
    assert "speaker attribution" in result["limitations"][0]

