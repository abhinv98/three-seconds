"""Meta Model API client (api.meta.ai), for Muse Voice Transcribe.

POST /v1/asr/transcribe takes multipart/form-data: a `request` JSON part and an `audio` part, a mono 16-bit PCM
WAV at 16 or 24 kHz of up to 10 minutes and 32 MB. In ENDPOINTING mode the answer has one turn per utterance,
{sessionId, transcript, audioDurationMs, turns: [{turnId, startMs, endMs, transcript}]}, timed per turn only and
with no language field. Pricing: $0.18 per hour of audio, billed in whole seconds rounded down; failed requests
are free. (languageBias is left out: in our tests it merged turns and doubled words.)
"""

from __future__ import annotations

import json
import logging
import os
import random
import time
import urllib.error
import urllib.request
import uuid

BASE_URL = "https://api.meta.ai/v1"
TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0"
USD_PER_AUDIO_HOUR = 0.18
_RETRY_STATUS = {429, 500, 503}
"""The API's own retry list: a 504 repeats if retried unchanged, and a 4xx never succeeds on a retry."""
_MAX_WAIT_S = 10.0
"""Longest single backoff, Retry-After included (a 503 asks for 60s): the audio isn't worth holding the report."""

log = logging.getLogger(__name__)


class MetaAPIError(RuntimeError):
    pass


def transcribe(wav: bytes, *, attempts: int = 3, timeout_s: float = 90) -> tuple[dict, float]:
    """Transcribe one WAV file with Muse Voice Transcribe.

    Returns:
        The JSON answer and what it cost in USD.

    Raises:
        MetaAPIError: no META_API_KEY, an HTTP error, a timeout on the last attempt, or an answer that isn't JSON.
    """
    key = os.environ.get("META_API_KEY")
    if not key:
        raise MetaAPIError("META_API_KEY is not set")
    boundary = uuid.uuid4().hex
    options = json.dumps({"model": TRANSCRIBE_MODEL, "audioEncoding": "WAV", "mode": "ENDPOINTING"})
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n'
            f'{options}\r\n--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio.wav"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode()
        + wav
        + f"\r\n--{boundary}--\r\n".encode()
    )
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    started = time.monotonic()
    for attempt in range(attempts):
        last = attempt == attempts - 1
        try:
            request = urllib.request.Request(f"{BASE_URL}/asr/transcribe", body, headers)
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                data = json.load(response)
            break
        except urllib.error.HTTPError as e:
            if e.code not in _RETRY_STATUS or last:
                detail = e.read().decode(errors="replace")[:300]
                raise MetaAPIError(f"{TRANSCRIBE_MODEL}: HTTP {e.code}: {detail}") from e
            wait = _seconds(e.headers.get("Retry-After"), default=2**attempt)
        except (urllib.error.URLError, TimeoutError) as e:
            if last:
                raise MetaAPIError(f"{TRANSCRIBE_MODEL}: {e}") from e
            wait = 2**attempt
        except ValueError as e:
            raise MetaAPIError(f"{TRANSCRIBE_MODEL}: the answer isn't JSON") from e
        time.sleep(min(wait, _MAX_WAIT_S) + random.uniform(0, 0.25))

    audio_ms = data.get("audioDurationMs") or 0
    cost = audio_ms // 1000 * USD_PER_AUDIO_HOUR / 3600
    log.info(
        "%s: %.1fs of audio, %d turns, $%.4f, %.1fs",
        TRANSCRIBE_MODEL,
        audio_ms / 1000,
        len(data.get("turns") or []),
        cost,
        time.monotonic() - started,
    )
    return data, cost


def _seconds(header: str | None, default: float) -> float:
    try:
        return float(header) if header else default
    except ValueError:  # an HTTP date instead of seconds
        return default
