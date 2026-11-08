import socket
import io
import wave
from pathlib import Path

import httpx
import pytest

from audio_worker.config import Settings
from audio_worker.downloader import AudioDownloadError, download_audio
from audio_worker.decoder import decode_audio


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))])


def settings(*hosts: str) -> Settings:
    return Settings("mongodb://unused", "cqa", "unused:9092", "test", frozenset(hosts), 4096, 1, max_redirects=4, media_resolution_attempts=3)


def test_unavailable_host_is_rejected_without_metrics(tmp_path: Path):
    destination = tmp_path / "audio"
    with pytest.raises(AudioDownloadError, match="not permitted"):
        download_audio("https://untrusted.example/audio.wav?sig=secret", destination, settings("media.example.com"))
    assert not destination.exists()


def test_direct_audio_is_streamed(tmp_path: Path):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, headers={"content-type": "audio/mpeg"}, content=b"ID3audio", request=request))
    destination = tmp_path / "audio"
    download_audio("https://media.example/audio.mp3", destination, settings("media.example"), transport=transport)
    assert destination.read_bytes() == b"ID3audio"


def test_html_source_decodes_entities_and_resolves_relative_urls(tmp_path: Path):
    seen = []
    def handler(request: httpx.Request):
        seen.append(str(request.url))
        if request.url.path == "/player/page":
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, content=b'<audio><source src="/media/file.mp3?sp=r&amp;sig=abc"></audio>', request=request)
        return httpx.Response(200, headers={"content-type": "audio/mpeg"}, content=b"ID3resolved", request=request)
    destination = tmp_path / "audio"
    download_audio("https://power.example/player/page", destination, settings("power.example"), transport=httpx.MockTransport(handler))
    assert seen[-1] == "https://power.example/media/file.mp3?sp=r&sig=abc"
    assert destination.read_bytes() == b"ID3resolved"


def test_html_without_audio_is_controlled_failure(tmp_path: Path):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html>login</html>", request=request))
    with pytest.raises(AudioDownloadError, match="did not contain"):
        download_audio("https://power.example/player", tmp_path / "audio", settings("power.example"), transport=transport)


def test_unsafe_redirect_is_rejected(tmp_path: Path):
    transport = httpx.MockTransport(lambda request: httpx.Response(302, headers={"location": "https://evil.example/file.mp3"}, request=request))
    with pytest.raises(AudioDownloadError, match="not permitted"):
        download_audio("https://power.example/player", tmp_path / "audio", settings("power.example"), transport=transport)


def test_expired_media_refetches_original_page(tmp_path: Path):
    page_requests = 0
    def handler(request: httpx.Request):
        nonlocal page_requests
        if request.url.path == "/player":
            page_requests += 1
            return httpx.Response(200, headers={"content-type": "text/html"}, content=f'<audio src="https://media.example/file.mp3?attempt={page_requests}"></audio>'.encode(), request=request)
        if request.url.params.get("attempt") == "1":
            return httpx.Response(403, request=request)
        return httpx.Response(200, headers={"content-type": "audio/mpeg"}, content=b"ID3fresh", request=request)
    destination = tmp_path / "audio"
    download_audio("https://power.example/player", destination, settings("power.example", "media.example"), transport=httpx.MockTransport(handler))
    assert page_requests == 2
    assert destination.read_bytes() == b"ID3fresh"


def test_downloaded_wav_is_passed_to_ffmpeg_decoder(tmp_path: Path):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 1600)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, headers={"content-type": "audio/wav"}, content=buffer.getvalue(), request=request))
    source, decoded = tmp_path / "source.wav", tmp_path / "decoded.wav"
    download_audio("https://media.example/call.wav", source, settings("media.example"), transport=transport)
    samples, sample_rate, channels = decode_audio(source, decoded)
    assert sample_rate == 16000 and channels == 1 and samples.size == 1600
