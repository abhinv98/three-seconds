"""Meta Model API client (api.meta.ai), for Muse Voice Transcribe and SAM 3.1 tracking.

POST /v1/asr/transcribe takes multipart/form-data: a `request` JSON part and an `audio` part, a mono 16-bit PCM
WAV at 16 or 24 kHz of up to 10 minutes and 32 MB. In ENDPOINTING mode the answer has one turn per utterance,
{sessionId, transcript, audioDurationMs, turns: [{turnId, startMs, endMs, transcript}]}, timed per turn only and
with no language field. Pricing: $0.18 per hour of audio, billed in whole seconds rounded down; failed requests
are free. (languageBias is left out: in our tests it merged turns and doubled words.)
"""

from __future__ import annotations

import base64
import http.client
import json
import logging
import os
import random
import re
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Iterable
from dataclasses import dataclass

BASE_URL = "https://api.meta.ai/v1"
TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0"
USD_PER_AUDIO_HOUR = 0.18
_RETRY_STATUS = {429, 500, 503}
"""The API's own retry list: a 504 repeats if retried unchanged, and a 4xx never succeeds on a retry."""
_MAX_WAIT_S = 10.0
"""Longest single backoff, Retry-After included (a 503 asks for 60s): the audio isn't worth holding the report."""
_NETWORK_ERRORS = (OSError, http.client.HTTPException)
"""urlopen wraps only the send in URLError. RemoteDisconnected, a reset or IncompleteRead while the answer is read
come through bare, and IncompleteRead isn't an OSError."""

log = logging.getLogger(__name__)


class MetaAPIError(RuntimeError):
    pass


def transcribe(wav: bytes, *, attempts: int = 3, timeout_s: float = 90) -> tuple[dict, float]:
    """Transcribe one WAV file with Muse Voice Transcribe.

    Returns:
        The JSON answer and what it cost in USD.

    Raises:
        MetaAPIError: no META_API_KEY, an HTTP error, a timeout or lost connection on the last attempt, or an answer
            that isn't JSON.
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
                raise MetaAPIError(f"{TRANSCRIBE_MODEL}: HTTP {e.code}: {_error_body(e)}") from e
            wait = _seconds(e.headers.get("Retry-After"), default=2**attempt)
        except _NETWORK_ERRORS as e:
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


def _error_body(error: urllib.error.HTTPError) -> str:
    """The connection can drop while the error's own body is being read."""
    try:
        return error.read().decode(errors="replace")[:300]
    except _NETWORK_ERRORS as e:
        return f"(body lost: {e!r})"


def _seconds(header: str | None, default: float) -> float:
    try:
        return float(header) if header else default
    except ValueError:  # an HTTP date instead of seconds
        return default


# ------------------------------------------------------------------------------------------------- SAM 3.1

SAM_MODEL = "sam-3.1"
USD_PER_1000_FRAMES = 0.20
MIN_FRAMES_BILLED = 50
"""Every frame processed is billed, matches or not, with at least 50 frames per request."""

_MASK = re.compile(r"<\|mask;[^|]*\|>")
_FRAME = re.compile(r"<(\d+)f>")
_BOX = re.compile(
    r"(\d+)<\|box;x1=([\d.]+);y1=([\d.]+);x2=([\d.]+);y2=([\d.]+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>"
)


@dataclass(frozen=True)
class SamBox:
    frame: int
    """Zero-based frame of the video that was sent."""
    object_id: int
    x1: float
    y1: float
    x2: float
    """Inclusive, in source pixels."""
    y2: float
    width: int
    """The video's size, which the box is measured in."""
    height: int
    confidence: float | None


def strip_masks(text: str) -> str:
    """SAM 3.1 has no option to leave masks out, and they are most of its output."""
    return _MASK.sub("", text)


def parse_sam_records(text: str) -> list[SamBox]:
    """Boxes from SAM 3.1 output: `<Nf>id<|box;x1=..;...;w=..;h=..;c=..|><|mask;...|>,id<|box...|>` per frame.

    Masks are dropped first (box-local rasters we don't need), so their payload can't be misread as a record.
    """
    out: list[SamBox] = []
    parts = _FRAME.split(strip_masks(text))
    for i in range(1, len(parts) - 1, 2):
        for m in _BOX.finditer(parts[i + 1]):
            out.append(
                SamBox(
                    frame=int(parts[i]),
                    object_id=int(m[1]),
                    x1=float(m[2]),
                    y1=float(m[3]),
                    x2=float(m[4]),
                    y2=float(m[5]),
                    width=int(m[6]),
                    height=int(m[7]),
                    confidence=float(m[8]) if m[8] else None,
                )
            )
    return out


def read_sam_lines(lines: Iterable[bytes], deadline: float | None = None) -> tuple[list[str], int]:
    """The frame lines of a streamed /v1/responses answer, and the frames billed.

    One `response.output_text.delta` per frame with objects, then `response.completed` with the usage. Failures
    mid-stream arrive as a `response.failed` or `error` event under HTTP 200. A stream that stops before
    `response.completed` counts as a lost connection even if the socket closed cleanly: the lines would be partial.
    """
    out: list[str] = []
    for raw in lines:
        if deadline is not None and time.monotonic() > deadline:
            raise MetaAPIError(f"{SAM_MODEL}: out of time")
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except ValueError:
            continue
        kind = event.get("type", "")
        if kind == "response.output_text.delta":
            if delta := str(event.get("delta", "")).strip():
                out.append(delta)
        elif kind == "response.completed":
            usage = (event.get("response") or {}).get("usage") or event.get("usage") or {}
            return out, int(usage.get("video_frames_processed") or 0)
        elif kind in ("response.failed", "error"):
            raise MetaAPIError(f"{SAM_MODEL}: {json.dumps(event)[:300]}")
    raise ConnectionError("the stream ended before response.completed")


def read_sam_stream(lines: Iterable[bytes]) -> tuple[list[SamBox], int]:
    """The boxes from a streamed /v1/responses answer, and the frames billed."""
    text, frames = read_sam_lines(lines)
    return [box for line in text for box in parse_sam_records(line)], frames


def _sam_call(
    prompt: str, mp4: bytes, fields: dict, attempts: int, timeout_s: float, deadline: float | None = None
) -> tuple[list[str], int]:
    """One streamed request, sent inline, with retries. Returns the frame lines and the frames billed."""
    key = os.environ.get("META_API_KEY")
    if not key:
        raise MetaAPIError("META_API_KEY is not set")
    body = json.dumps(
        {
            "model": SAM_MODEL,
            "stream": True,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_video", "video_url": "data:video/mp4;base64," + base64.b64encode(mp4).decode()},
                    ],
                }
            ],
            **fields,
        }
    ).encode()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "text/event-stream"}
    for attempt in range(attempts):
        last = attempt == attempts - 1
        left = timeout_s if deadline is None else min(timeout_s, deadline - time.monotonic())
        if left <= 0:
            raise MetaAPIError(f"{SAM_MODEL}: out of time")
        try:
            request = urllib.request.Request(f"{BASE_URL}/responses", body, headers)
            with urllib.request.urlopen(request, timeout=left) as response:
                return read_sam_lines(response, deadline)
        except urllib.error.HTTPError as e:
            if e.code not in _RETRY_STATUS or last:
                raise MetaAPIError(f"{SAM_MODEL}: HTTP {e.code}: {_error_body(e)}") from e
            wait = _seconds(e.headers.get("Retry-After"), default=2**attempt)
        except _NETWORK_ERRORS as e:
            if last:
                raise MetaAPIError(f"{SAM_MODEL}: {e}") from e
            wait = 2**attempt
        log.warning("%s: attempt %d of %d failed, trying again", SAM_MODEL, attempt + 1, attempts)
        time.sleep(min(wait, _MAX_WAIT_S) + random.uniform(0, 0.25))
    raise MetaAPIError(f"{SAM_MODEL}: no attempts made")


def _sam_cost(frames: int) -> float:
    return max(frames, MIN_FRAMES_BILLED) * USD_PER_1000_FRAMES / 1000


def sam_track(mp4: bytes, prompt: str, *, attempts: int = 3, timeout_s: float = 120) -> tuple[list[SamBox], float]:
    """Track what a box prompt points at through a short MP4 (sent inline, so keep it well under 50 MB).

    Returns:
        Every box SAM 3.1 returned, and what the request cost in USD.

    Raises:
        MetaAPIError: no META_API_KEY, an HTTP error, a failure event, or a timeout or lost connection on the last
            attempt.
    """
    started = time.monotonic()
    metadata = {"include_confidence": "true", "mask_encoding": "one_bit", "propagation_direction": "both"}
    lines, frames = _sam_call(prompt, mp4, {"metadata": metadata}, attempts, timeout_s)
    boxes = [box for line in lines for box in parse_sam_records(line)]
    cost = _sam_cost(frames)
    log.info(
        "%s: %d frames billed, %d boxes, $%.4f, %.1fs", SAM_MODEL, frames, len(boxes), cost, time.monotonic() - started
    )
    return boxes, cost


def sam_segment(
    mp4: bytes, phrase: str, *, attempts: int = 3, timeout_s: float = 120, deadline: float | None = None
) -> tuple[list[str], float]:
    """Find a text concept through a whole Reel.

    A retry after a stream was lost may be billed again: the docs don't say whether an interrupted stream is free.

    Args:
        mp4: H.264 video, sent inline.
        phrase: The concept, such as "person" or "sunglasses".
        deadline: time.monotonic() value to give up at, for the caller's own time limit.

    Returns:
        The raw frame lines (one per frame with a match) and what the request cost in USD.

    Raises:
        MetaAPIError: no META_API_KEY, an HTTP error, a failure event, out of time, or a timeout or lost connection on
            the last attempt.
    """
    started = time.monotonic()
    fields = {"store": False, "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"}}
    lines, frames = _sam_call(phrase, mp4, fields, attempts, timeout_s, deadline)
    cost = _sam_cost(frames)
    log.info(
        "%s %r: %d frames billed, %d lines, $%.4f, %.1fs",
        SAM_MODEL,
        phrase,
        frames,
        len(lines),
        cost,
        time.monotonic() - started,
    )
    return lines, cost
