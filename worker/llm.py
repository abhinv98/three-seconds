"""Chat Completions client for Muse Spark Open.

PROVIDER picks the host: baseten (default) or fireworks (fallback). Both speak OpenAI Chat
Completions, so the request code is shared; only the base URL, key and model slug differ.

Muse Spark Open always reasons. The reasoning comes back in message.reasoning_content and the
answer in message.content (docs.baseten.co/inference/model-apis/reasoning); chat() returns only
the answer. It has no JSON mode or structured outputs, so callers parse JSON out of the text.

Audio input works on Baseten only: Fireworks rejects audio_url and input_audio parts with HTTP 400.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class Provider:
    base_url: str
    key_env: str
    model: str


PROVIDERS = {
    # The Baseten key only works with this exact slug; plain "meta-models/muse-spark-open" returns 401.
    "baseten": Provider("https://inference.baseten.co/v1", "BASETEN_API_KEY", "meta-models/muse-spark-open-1026"),
    "fireworks": Provider(
        "https://api.fireworks.ai/inference/v1", "FIREWORKS_API_KEY", "accounts/fireworks/models/muse-spark-open"
    ),
}

_RETRY_STATUS = {429, 500, 502, 503, 529}


class LLMError(RuntimeError):
    pass


def provider() -> Provider:
    name = os.environ.get("PROVIDER", "baseten")
    if name not in PROVIDERS:
        raise LLMError(f"PROVIDER must be one of {sorted(PROVIDERS)}, got {name!r}")
    return PROVIDERS[name]


def image_part(jpeg: bytes, detail: str = "auto") -> dict:
    """An image content part as a base64 data URL (docs.baseten.co/inference/model-apis/vision)."""
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    return {"type": "image_url", "image_url": {"url": url, "detail": detail}}


def audio_part(wav: bytes) -> dict:
    """An audio content part as a base64 data URL (docs.baseten.co/inference/model-apis/audio).

    Muse Spark Open takes WAV/MP3/FLAC/OGG/M4A at 8-48 kHz, up to 4 files of 5 minutes per request.
    """
    url = "data:audio/wav;base64," + base64.b64encode(wav).decode()
    return {"type": "audio_url", "audio_url": {"url": url}}


def chat(messages: list[dict], *, attempts: int = 3, **params: object) -> str:
    """Send a Chat Completions request and return the final answer text.

    Args:
        messages: OpenAI-format messages; content may mix text, image_part() and audio_part().
        attempts: Tries for 429/5xx/529, with 1s, 2s, 4s backoff.
        **params: Extra request fields, e.g. reasoning_effort="low" or max_tokens=2048.

    Returns:
        choices[0].message.content. The reasoning is dropped.

    Raises:
        LLMError: HTTP error, refusal, or an answer cut off by max_tokens.
    """
    p = provider()
    body = json.dumps({"model": p.model, "messages": messages, **params}).encode()
    request = urllib.request.Request(
        f"{p.base_url}/chat/completions",
        body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {os.environ[p.key_env]}"},
    )
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.load(response)
            break
        except urllib.error.HTTPError as e:
            if e.code not in _RETRY_STATUS or attempt == attempts - 1:
                raise LLMError(f"{p.model}: HTTP {e.code}: {e.read().decode(errors='replace')[:500]}") from e
            time.sleep(2**attempt)

    choice = data["choices"][0]
    message = choice["message"]
    if message.get("refusal"):
        raise LLMError(f"{p.model} refused: {message['refusal']}")
    if choice.get("finish_reason") == "length":
        raise LLMError(f"{p.model} hit max_tokens before finishing its answer (reasoning counts toward it)")
    return message.get("content") or ""
