"""Merges per-frame readings into a disclosure track.

Each frame is one of: label or caption (a permitted ASCI 1.3a disclosure, as a tag/overlay or as
superimposed subtitles), unlisted (disclosure-like text that isn't a 1.3a label, such as "Collab"),
absent, or unknown (no parseable answer). A frame stands for the time until the next reading (the last
one for 1/fps, capped at the video's end), so 2 fps readings and 10 fps edge readings can be mixed;
consecutive frames in the chosen states merge into one span.
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
    """Time spans of consecutive frames whose state is in `states`. Readings must be in time order."""
    spans: list[Span] = []
    start: float | None = None
    for i, reading in enumerate(readings):
        if state(reading) in states and start is None:
            start = reading.t
        last = i == len(readings) - 1
        if start is not None and (last or state(readings[i + 1]) not in states):
            end = min(duration_s, reading.t + 1 / fps) if last else readings[i + 1].t
            spans.append(Span(t_start=start, t_end=round(end, 3)))
            start = None
    return spans


def longest(spans: list[Span]) -> float:
    return round(max((s.t_end - s.t_start for s in spans), default=0.0), 1)


def edge_windows(
    readings: list[FrameReading], need_s: float, fps: float, duration_s: float
) -> list[tuple[float, float]]:
    """Where to re-sample when sampling at `fps` can't tell whether the label was held `need_s`.

    At fps, a measured hold is off by up to one interval either way. If the longest disclosed span is
    within one interval of need_s, every span that close gets a window of one interval either side of
    its start and end. Edges at the very start or end of the video are exact and get none.
    """
    margin = 1 / fps
    spans = spans_where(readings, DISCLOSED, fps, duration_s)
    if not spans or abs(longest(spans) - need_s) > margin + 1e-9:
        return []
    windows = []
    for span in spans:
        if abs(span.t_end - span.t_start - need_s) > margin + 1e-9:
            continue
        if span.t_start > 0:
            windows.append((max(0.0, span.t_start - margin), span.t_start + margin))
        if span.t_end < duration_s:
            windows.append((span.t_end - margin, min(duration_s, span.t_end + margin)))
    return windows


def merge_readings(coarse: list[FrameReading], fine: list[FrameReading]) -> list[FrameReading]:
    """Coarse readings with the fine ones laid over them, in time order.

    A fine reading replaces the coarse one at the same time, unless it is unknown and the coarse one isn't.
    """
    by_ms = {round(r.t * 1000): r for r in coarse}
    for r in fine:
        key = round(r.t * 1000)
        if r.label_present is not None or key not in by_ms:
            by_ms[key] = r
    return [by_ms[k] for k in sorted(by_ms)]


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
