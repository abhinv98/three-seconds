"""Merges per-frame label readings into a disclosure-label track.

A frame stands for the interval [t, t + 1/fps). Consecutive frames with the label merge into one
span; an absent frame ends it. Unknown frames also end it unless count_unknown is set, which gives
the most the label could have been on screen.
"""

from __future__ import annotations

from collections import Counter

from models import Span, Track
from pipeline.vision import FrameReading


def label_spans(
    readings: list[FrameReading], fps: float, duration_s: float, *, count_unknown: bool = False
) -> list[Span]:
    """Time spans where the label is on screen (or might be, with count_unknown)."""
    on = {True, None} if count_unknown else {True}
    spans: list[Span] = []
    start: float | None = None
    for i, reading in enumerate(readings):
        if reading.label_present in on and start is None:
            start = reading.t
        is_last = i == len(readings) - 1 or readings[i + 1].label_present not in on
        if start is not None and is_last:
            spans.append(Span(t_start=start, t_end=round(min(duration_s, reading.t + 1 / fps), 3)))
            start = None
    return spans


def unknown_spans(readings: list[FrameReading], fps: float, duration_s: float) -> list[Span]:
    """Time spans of frames the model gave no answer for."""
    flipped = [FrameReading(r.t, r.label_present is None) for r in readings]
    return label_spans(flipped, fps, duration_s)


def longest(spans: list[Span]) -> float:
    return round(max((s.t_end - s.t_start for s in spans), default=0.0), 1)


def label_track(readings: list[FrameReading], fps: float, duration_s: float) -> Track:
    """The disclosure-label track, named after the label text read most often."""
    spans = label_spans(readings, fps, duration_s)
    texts = Counter(r.label_text for r in readings if r.label_present and r.label_text)
    return Track(
        label=texts.most_common(1)[0][0] if texts else "Disclosure label",
        kind="disclosure_label",
        spans=spans,
        first_seen_s=spans[0].t_start if spans else None,
        last_seen_s=spans[-1].t_end if spans else None,
        total_on_screen_s=round(sum(s.t_end - s.t_start for s in spans), 1),
        longest_continuous_s=longest(spans),
        # ponytail: the vision prompt doesn't measure label size; ask for a bounding box when a check needs it.
        max_frame_share=0.0,
    )
