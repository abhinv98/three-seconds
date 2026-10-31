"""Merges per-frame readings into a disclosure track.

Each frame is one of: label or caption (a permitted ASCI 1.3a disclosure, as a tag/overlay or as
superimposed subtitles), unlisted (disclosure-like text that isn't a 1.3a label, such as "Collab"),
absent, or unknown (no parseable answer). A frame stands for [t, t + 1/fps); consecutive frames in
the chosen states merge into one span.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Collection

from models import Span, Track
from pipeline.asci import is_permitted
from pipeline.vision import FrameReading

DISCLOSED = {"label", "caption"}
UNCERTAIN = {"unlisted", "unknown"}


def state(reading: FrameReading) -> str:
    """label, caption, unlisted, absent or unknown."""
    if reading.label_present is None:
        return "unknown"
    if not reading.label_present:
        return "absent"
    return reading.kind if is_permitted(reading.label_text) else "unlisted"


def spans_where(readings: list[FrameReading], states: Collection[str], fps: float, duration_s: float) -> list[Span]:
    """Time spans of consecutive frames whose state is in `states`."""
    spans: list[Span] = []
    start: float | None = None
    for i, reading in enumerate(readings):
        inside = state(reading) in states
        if inside and start is None:
            start = reading.t
        if start is not None and (i == len(readings) - 1 or state(readings[i + 1]) not in states):
            spans.append(Span(t_start=start, t_end=round(min(duration_s, reading.t + 1 / fps), 3)))
            start = None
    return spans


def longest(spans: list[Span]) -> float:
    return round(max((s.t_end - s.t_start for s in spans), default=0.0), 1)


def label_track(readings: list[FrameReading], fps: float, duration_s: float) -> Track:
    """The disclosure track (labels and captions with a 1.3a label), named after its most frequent text."""
    spans = spans_where(readings, DISCLOSED, fps, duration_s)
    permitted = Counter(r.label_text for r in readings if state(r) in DISCLOSED)
    other = Counter(r.label_text for r in readings if state(r) == "unlisted" and r.label_text)
    name = (permitted or other).most_common(1)[0][0] if (permitted or other) else "Disclosure label"
    return Track(
        label=name,
        kind="disclosure_label",
        spans=spans,
        first_seen_s=spans[0].t_start if spans else None,
        last_seen_s=spans[-1].t_end if spans else None,
        total_on_screen_s=round(sum(s.t_end - s.t_start for s in spans), 1),
        longest_continuous_s=longest(spans),
        # ponytail: the vision prompt doesn't measure label size; ask for a bounding box when a check needs it.
        max_frame_share=0.0,
    )
