from __future__ import annotations

import ipaddress
import json
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .config import Settings


class AudioDownloadError(RuntimeError):
    pass


def _validate_url(url: str, settings: Settings) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise AudioDownloadError("Audio URL must use HTTP or HTTPS")
    if parsed.hostname.lower() not in settings.allowed_audio_hosts:
        raise AudioDownloadError("Audio URL host is not permitted")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))}
    except socket.gaierror as exc:
        raise AudioDownloadError("Audio host could not be resolved") from exc
    if any(ipaddress.ip_address(address).is_private or ipaddress.ip_address(address).is_loopback or ipaddress.ip_address(address).is_link_local for address in addresses):
        raise AudioDownloadError("Audio host resolves to a non-public address")


def _json_media_url(response: httpx.Response) -> str | None:
    try:
        value = response.json()
    except json.JSONDecodeError:
        return None
    if not isinstance(value, dict):
        return None
    for key in ("url", "audio_url", "download_url", "media_url"):
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate:
            return candidate
    return None


def download_audio(url: str, destination: Path, settings: Settings) -> None:
    current = url
    timeout = httpx.Timeout(settings.download_timeout_seconds)
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for _ in range(3):
            _validate_url(current, settings)
            with client.stream("GET", current, headers={"Accept": "audio/*, application/octet-stream, application/json"}) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise AudioDownloadError("Audio redirect did not include a location")
                    current = str(response.url.join(location))
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if "json" in content_type:
                    response.read()
                    media_url = _json_media_url(response)
                    if not media_url:
                        raise AudioDownloadError("Audio API response did not contain a media URL")
                    current = media_url
                    continue
                if not any(token in content_type for token in ("audio/", "video/", "application/octet-stream")):
                    raise AudioDownloadError("Response content type is not supported audio")
                size = 0
                with destination.open("wb") as output:
                    for chunk in response.iter_bytes(64 * 1024):
                        size += len(chunk)
                        if size > settings.max_download_bytes:
                            raise AudioDownloadError("Audio download exceeds the configured size limit")
                        output.write(chunk)
                if not size:
                    raise AudioDownloadError("Audio response was empty")
                return
    raise AudioDownloadError("Audio source exceeded the redirect limit")

