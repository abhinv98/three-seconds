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
import http.client
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
    usd_per_m_input: float | None
    """Price per million tokens, or None where the provider's API doesn't publish one."""
    usd_per_m_output: float | None


PROVIDERS = {
    # The Baseten key only works with this exact slug; plain "meta-models/muse-spark-open" returns 401.
    # Prices from GET https://inference.baseten.co/v1/models (2026-10-31).
    "baseten": Provider(
        "https://inference.baseten.co/v1", "BASETEN_API_KEY", "meta-models/muse-spark-open-1026", 1.25, 4.25
    ),
    "fireworks": Provider(
        "https://api.fireworks.ai/inference/v1",
        "FIREWORKS_API_KEY",
        "accounts/fireworks/models/muse-spark-open",
        None,
        None,
    ),
}


@dataclass(frozen=True)
class Reply:
    text: str
    """choices[0].message.content; the reasoning is dropped."""
    prompt_tokens: int
    completion_tokens: int
    """Includes reasoning tokens."""
    cost_usd: float | None
    """At list price, ignoring the cached-input discount (an upper bound); None if the price is unknown."""


_RETRY_STATUS = {429, 500, 502, 503, 529}
_NETWORK_RETRIES = 1
REQUEST_TIMEOUT_S = 90
"""Per attempt. Requests usually take 8-30s, and a retried batch has to finish inside the worker's 300s limit."""


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


def _error_body(error: urllib.error.HTTPError) -> str:
    """The connection can drop while the error's own body is being read."""
    try:
        return error.read().decode(errors="replace")[:500]
    except (OSError, http.client.HTTPException) as e:
        return f"(body lost: {e!r})"


def chat(messages: list[dict], *, attempts: int = 3, **params: object) -> Reply:
    """Send a Chat Completions request and return the final answer with its token usage.

    Args:
        messages: OpenAI-format messages; content may mix text, image_part() and audio_part().
        attempts: Tries for 429/5xx/529, with 1s, 2s, 4s backoff. A timeout or lost connection gets one retry.
        **params: Extra request fields, e.g. reasoning_effort="low" or max_tokens=2048.

    Returns:
        The answer text (choices[0].message.content, without the reasoning), tokens and cost.

    Raises:
        LLMError: HTTP error, no usable answer after the retry, refusal, or an answer cut off by max_tokens.
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
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
                data = json.load(response)
            break
        except urllib.error.HTTPError as e:
            if e.code not in _RETRY_STATUS or attempt == attempts - 1:
                raise LLMError(f"{p.model}: HTTP {e.code}: {_error_body(e)}") from e
            time.sleep(2**attempt)
        except (OSError, http.client.HTTPException, ValueError) as e:  # Timeout, lost connection, cut-off body.
            if attempt >= min(_NETWORK_RETRIES, attempts - 1):
                raise LLMError(f"{p.model}: no answer: {e!r}") from e
            time.sleep(2**attempt)

    try:
        choice = data["choices"][0]
        message = choice["message"]
        if message.get("refusal"):
            raise LLMError(f"{p.model} refused: {message['refusal']}")
        if choice.get("finish_reason") == "length":
            raise LLMError(f"{p.model} hit max_tokens before finishing its answer (reasoning counts toward it)")
        text = message.get("content") or ""
        if not isinstance(text, str):
            raise TypeError("content is not text")
        usage = data.get("usage") or {}
        prompt_tokens, completion_tokens = usage.get("prompt_tokens") or 0, usage.get("completion_tokens") or 0
        cost = None
        if p.usd_per_m_input is not None and p.usd_per_m_output is not None:
            cost = (prompt_tokens * p.usd_per_m_input + completion_tokens * p.usd_per_m_output) / 1e6
        return Reply(text, prompt_tokens, completion_tokens, cost)
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        raise LLMError(f"{p.model}: unexpected answer: {json.dumps(data)[:300]}") from e
