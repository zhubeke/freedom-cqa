from __future__ import annotations

import ipaddress
import json
import socket
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .config import Settings
from .models import AudioErrorCode, AudioPipelineError


class AudioDownloadError(AudioPipelineError):
    def __init__(self, message: str, code: AudioErrorCode = AudioErrorCode.DOWNLOAD_FAILED, retryable: bool = False):
        super().__init__(code, message, retryable)


class _ExpiredMediaUrl(AudioDownloadError):
    def __init__(self, message: str):
        super().__init__(message, AudioErrorCode.URL_EXPIRED)


def _validate_url(url: str, settings: Settings) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise AudioDownloadError("Audio URL must be an HTTPS URL without embedded credentials")
    if parsed.hostname.lower() not in settings.allowed_audio_hosts:
        raise AudioDownloadError("Audio URL host is not permitted")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror as exc:
        raise AudioDownloadError("Audio host could not be resolved") from exc
    if any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise AudioDownloadError("Audio host resolves to a non-public address")


def _json_media_url(response: httpx.Response) -> str | None:
    try:
        value = response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(value, dict):
        return None
    for key in ("url", "audio_url", "download_url", "media_url"):
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate:
            return candidate
    return None


def _html_media_url(response: httpx.Response, body: bytes) -> str:
    if len(body) > 2 * 1024 * 1024:
        raise AudioDownloadError("Audio player HTML exceeds the configured parsing limit")
    soup = BeautifulSoup(body, "lxml")
    audio = soup.find("audio")
    candidate = None if audio is None else audio.get("src")
    if not candidate and audio is not None:
        source = audio.find("source")
        candidate = None if source is None else source.get("src")
    if not isinstance(candidate, str) or not candidate.strip():
        raise AudioDownloadError("Audio player page did not contain an audio source")
    return urljoin(str(response.url), candidate.strip())


def _write_audio(response: httpx.Response, destination: Path, settings: Settings) -> None:
    size = 0
    prefix = bytearray()
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        with temporary.open("wb") as output:
            for chunk in response.iter_bytes(64 * 1024):
                if not chunk:
                    continue
                size += len(chunk)
                if size > settings.max_download_bytes:
                    raise AudioDownloadError("Audio download exceeds the configured size limit", AudioErrorCode.TOO_LARGE)
                if len(prefix) < 512:
                    prefix.extend(chunk[: 512 - len(prefix)])
                output.write(chunk)
        if not size:
            raise AudioDownloadError("Audio response was empty")
        if bytes(prefix).lstrip().lower().startswith((b"<!doctype html", b"<html", b"<head", b"<body")):
            raise AudioDownloadError("Media URL returned an HTML page instead of audio")
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def _download_from_source(source_url: str, destination: Path, settings: Settings, client: httpx.Client) -> None:
    current = source_url
    extracted_media = False
    for _ in range(settings.max_redirects + 1):
        _validate_url(current, settings)
        with client.stream("GET", current, headers={"Accept": "audio/*, application/octet-stream, application/json, text/html"}) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise AudioDownloadError("Audio redirect did not include a location")
                current = urljoin(str(response.url), location)
                continue
            if extracted_media and response.status_code in {401, 403, 404, 410}:
                raise _ExpiredMediaUrl("Extracted media URL is unavailable or expired")
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                code = AudioErrorCode.ACCESS_DENIED if response.status_code in {401, 403} else AudioErrorCode.URL_EXPIRED if response.status_code in {404, 410} else AudioErrorCode.DOWNLOAD_FAILED
                raise AudioDownloadError(f"Audio source returned HTTP {response.status_code}", code, response.status_code >= 500) from exc
            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if content_type in {"text/html", "application/xhtml+xml"}:
                if extracted_media:
                    raise _ExpiredMediaUrl("Extracted media URL returned an HTML error or login page")
                current = _html_media_url(response, response.read())
                _validate_url(current, settings)
                extracted_media = True
                continue
            if content_type == "application/json" or content_type.endswith("+json"):
                response.read()
                media_url = _json_media_url(response)
                if not media_url:
                    raise AudioDownloadError("Audio API response did not contain a media URL")
                current = urljoin(str(response.url), media_url)
                _validate_url(current, settings)
                extracted_media = True
                continue
            if not any(token in content_type for token in ("audio/", "video/", "application/octet-stream")):
                raise AudioDownloadError("Response content type is not supported audio")
            _write_audio(response, destination, settings)
            return
    raise AudioDownloadError("Audio source exceeded the redirect limit")


def download_audio(url: str, destination: Path, settings: Settings, *, transport: httpx.BaseTransport | None = None) -> None:
    """Resolve the original URL on every retry so temporary media links are never reused."""
    _validate_url(url, settings)
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    last_error: AudioDownloadError | None = None
    with httpx.Client(timeout=timeout, follow_redirects=False, transport=transport) as client:
        for attempt in range(settings.max_retries + 1):
            destination.unlink(missing_ok=True)
            try:
                _download_from_source(url, destination, settings, client)
                return
            except _ExpiredMediaUrl as exc:
                last_error = exc
                if attempt == settings.max_retries:
                    break
    raise AudioDownloadError("Audio media URL remained unavailable after bounded re-resolution") from last_error

