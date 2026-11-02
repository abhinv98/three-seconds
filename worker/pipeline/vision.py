"""Disclosure-label reading with Muse Spark Open.

Frames go to the model in batches of 8 (its per-request image limit), each preceded by its
timestamp. The model has no JSON mode, so the answer is parsed defensively: every JSON array or
object in the text is collected and matched to frames by timestamp. A frame with no parseable
answer is unknown (label_present None), never absent.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import llm
from pipeline.frames import Frame

BATCH_SIZE = 8
PARALLEL_REQUESTS = 8
REASONING_EFFORT = "low"

PROMPT = """These are {n} frames from a creator video (an Instagram Reel or YouTube Short), each one preceded by its timestamp.

For every frame, decide whether advertising-disclosure text is visible on screen. Count either:
- a label: a tag, sticker or text overlay such as Instagram's "Paid partnership" line under the username, "Ad", "#ad", "Sponsored", "Collab", "Collaboration", "Partnership", "Affiliate", "Free gift", "Includes paid promotion", or Hindi such as "विज्ञापन", "प्रायोजित", "सशुल्क साझेदारी";
- a caption: superimposed subtitles of what is said, when their words disclose the ad, such as "Yeh video sponsored hai".
A brand name, logo, product or price on its own is not a disclosure.
Count only disclosure text that belongs to this video: overlays, stickers or captions the creator added, or Instagram's own "Paid partnership" line. Words inside a screenshot, web page, app or shop listing that the video shows (such as a "Sponsored" tag on a product in a store page, or "Free gift with purchase") are not a disclosure.

Reply with a JSON array only, one object per frame, in the same order:
{{"t": <timestamp in seconds>, "label_present": true or false, "kind": "label" | "caption" (say "label" if both are visible), "label_text": "<the exact disclosure text, or empty>", "language": "en" | "hi-Deva" | "hi-Latn" | "other" | "", "position": "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right" | "", "legible": <true if the text is easy to read at phone size, false otherwise or when there is none>}}"""

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FrameReading:
    t: float
    label_present: bool | None
    """None: the model gave no parseable answer for this frame (unknown, not absent)."""
    kind: str = "label"
    """label (tag, sticker, overlay) or caption (subtitles of speech)."""
    label_text: str = ""
    language: str = ""
    position: str = ""
    legible: bool | None = None


def read_frames(frames: list[Frame]) -> tuple[list[FrameReading], list[llm.Reply]]:
    """Ask the model about every frame.

    Returns:
        One reading per frame in time order, and the model replies (for token and cost accounting).
    """
    batches = [frames[i : i + BATCH_SIZE] for i in range(0, len(frames), BATCH_SIZE)]
    with ThreadPoolExecutor(PARALLEL_REQUESTS) as pool:
        results = list(pool.map(_read_batch, batches))
    readings = [r for batch_readings, _ in results for r in batch_readings]
    replies = [reply for _, reply in results if reply is not None]
    return readings, replies


def _read_batch(batch: list[Frame]) -> tuple[list[FrameReading], llm.Reply | None]:
    content: list[dict] = [{"type": "text", "text": PROMPT.format(n=len(batch))}]
    for frame in batch:
        content.append({"type": "text", "text": f"t={frame.t:.1f}"})
        content.append(llm.image_part(frame.path.read_bytes()))
    times = [f.t for f in batch]
    try:
        reply = llm.chat([{"role": "user", "content": content}], reasoning_effort=REASONING_EFFORT, max_tokens=8192)
    except llm.LLMError as e:
        log.warning("vision batch %.1f-%.1fs failed: %s", times[0], times[-1], e)
        return [FrameReading(t, None) for t in times], None
    return parse_readings(reply.text, times), reply


def parse_readings(text: str, times: list[float]) -> list[FrameReading]:
    """Match the model's per-frame objects to frame timestamps.

    Objects are matched by their "t" (within half a frame interval). If none carry a usable "t" but
    there is exactly one per frame, they are matched in order. Anything unmatched is unknown.
    """
    objects = _json_values(text)
    tolerance = (times[1] - times[0]) / 2 if len(times) > 1 else 0.25
    by_index: dict[int, dict] = {}
    for obj in objects:
        t = _number(obj.get("t"))
        if t is None:
            continue
        i = min(range(len(times)), key=lambda k: abs(times[k] - t))
        if abs(times[i] - t) <= tolerance:
            by_index.setdefault(i, obj)
    if not by_index and len(objects) == len(times):
        by_index = dict(enumerate(objects))
    return [_reading(t, by_index.get(i)) for i, t in enumerate(times)]


def _json_values(text: str) -> list[dict]:
    """Every JSON object in text, including those inside arrays, skipping prose and code fences."""
    decoder = json.JSONDecoder()
    found: list[dict] = []
    i = 0
    while i < len(text):
        if text[i] not in "[{":
            i += 1
            continue
        try:
            value, end = decoder.raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        stack = [value]
        while stack:
            v = stack.pop()
            if isinstance(v, list):
                stack.extend(reversed(v))
            elif isinstance(v, dict):
                if "label_present" in v:
                    found.append(v)
                else:
                    stack.extend(reversed([x for x in v.values() if isinstance(x, (list, dict))]))
        i = end
    return found


def _reading(t: float, obj: dict | None) -> FrameReading:
    if obj is None:
        return FrameReading(t, None)
    present = _bool(obj.get("label_present"))
    if present is None:
        return FrameReading(t, None)
    return FrameReading(
        t=t,
        label_present=present,
        kind="caption" if present and _text(obj.get("kind")).lower() == "caption" else "label",
        label_text=_text(obj.get("label_text")) if present else "",
        language=_text(obj.get("language"))[:16] if present else "",
        position=_text(obj.get("position"))[:16] if present else "",
        legible=_bool(obj.get("legible")) if present else None,
    )


def _bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"true", "yes"}:
        return True
    if isinstance(value, str) and value.strip().lower() in {"false", "no"}:
        return False
    return None


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        return float(str(value).rstrip("s"))
    except ValueError:
        return None


def _text(value: object) -> str:
    return value.strip()[:200] if isinstance(value, str) else ""
