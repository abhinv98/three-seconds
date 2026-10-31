"""Rule checks from the measured label track.

Clause codes and thresholds must come from the verified ASCI guideline; until then every check
cites ASCI-PENDING and the hold threshold is config.LABEL_MIN_SECONDS.

Unknown frames never count as absent: a check that the unknown frames could flip is REVIEW.
"""

from __future__ import annotations

import config
from models import Check, Clause, Evidence, Fix, Span, Track, Verdict
from pipeline.track import label_spans, longest, unknown_spans
from pipeline.vision import FrameReading

PENDING = Clause(code="ASCI-PENDING", text="Clause text to be verified against the ASCI guideline", source_url=None)


def timecode(seconds: float) -> str:
    """00:03.0 style."""
    tenths = round(max(0.0, seconds) * 10)
    minutes, rest = divmod(tenths, 600)
    return f"{minutes:02d}:{rest / 10:04.1f}"


def evaluate_rules(readings: list[FrameReading], track: Track, fps: float, duration_s: float) -> list[Check]:
    """label_present, label_duration and spoken_disclosure, in that order."""
    unknown = unknown_spans(readings, fps, duration_s)
    unread = [
        Evidence(t_start=s.t_start, t_end=s.t_end, kind="frame", note="Frames could not be read") for s in unknown
    ]
    return [
        _label_present(readings, track, unread),
        _label_duration(readings, track, unread, fps, duration_s),
        Check(
            id="spoken_disclosure",
            title="Spoken disclosure",
            verdict="REVIEW",
            detail="Audio check coming",
            clause=PENDING,
            evidence=[],
            fix=Fix(steps=["Until the audio check is live, listen for a spoken disclosure yourself."]),
        ),
    ]


def _label_present(readings: list[FrameReading], track: Track, unread: list[Evidence]) -> Check:
    title = "Disclosure label on screen"
    if track.spans:
        evidence = [_label_evidence(readings, s, f'"{track.label}" label') for s in track.spans]
        detail = f'"{track.label}" label on screen from {timecode(track.spans[0].t_start)}.'
        return Check(id="label_present", title=title, verdict="PASS", detail=detail, clause=PENDING, evidence=evidence)
    if unread:
        n = sum(r.label_present is None for r in readings)
        return Check(
            id="label_present",
            title=title,
            verdict="REVIEW",
            detail=f"No label found, but {n} of {len(readings)} frames could not be read.",
            clause=PENDING,
            evidence=unread,
            fix=Fix(steps=["Check the unread stretches by eye, or run the check again."]),
        )
    return Check(
        id="label_present",
        title=title,
        verdict="FAIL",
        detail="No disclosure label on screen.",
        clause=PENDING,
        evidence=[],
        fix=Fix(steps=['Add a "Paid partnership" label on screen from the first second.']),
    )


def _label_duration(
    readings: list[FrameReading], track: Track, unread: list[Evidence], fps: float, duration_s: float
) -> Check:
    need = config.LABEL_MIN_SECONDS
    held = track.longest_continuous_s
    at_most = longest(label_spans(readings, fps, duration_s, count_unknown=True))
    threshold = f"The check needs {need:g}s in one stretch (threshold not yet verified)."
    evidence = [_label_evidence(readings, s, "Label on screen") for s in track.spans] + unread
    verdict: Verdict
    if held >= need:
        verdict, fix = "PASS", None
        detail = f"Label held {held:.1f}s in one stretch, {track.total_on_screen_s:.1f}s in all. {threshold}"
    elif at_most < need:
        verdict = "FAIL"
        fix = Fix(steps=[f"Keep the label on screen for at least {need:g}s without a break."])
        detail = (
            f"Label held {held:.1f}s at most in one stretch. {threshold}"
            if track.spans
            else (f"No label on screen to hold. {threshold}")
        )
    else:
        verdict = "REVIEW"
        fix = Fix(steps=["Check the unread stretches by eye; they decide this check."])
        detail = (
            f"Label held {held:.1f}s for sure, up to {at_most:.1f}s counting frames that could not be read. {threshold}"
        )
    return Check(
        id="label_duration",
        title="Label held long enough",
        verdict=verdict,
        detail=detail,
        clause=PENDING,
        evidence=evidence,
        fix=fix,
    )


def _label_evidence(readings: list[FrameReading], span: Span, what: str) -> Evidence:
    inside = [r for r in readings if r.label_present and span.t_start <= r.t < span.t_end]
    position = max((r.position for r in inside), key=[r.position for r in inside].count, default="")
    illegible = sum(r.legible is False for r in inside)
    note = what + (f", {position}" if position else "") + (f", hard to read in {illegible} frames" if illegible else "")
    return Evidence(t_start=span.t_start, t_end=span.t_end, kind="frame", note=note)


def overall_verdict(checks: list[Check]) -> Verdict:
    """FAIL if any check fails, else REVIEW if any needs review, else PASS."""
    verdicts = {c.verdict for c in checks}
    if "FAIL" in verdicts:
        return "FAIL"
    if "REVIEW" in verdicts:
        return "REVIEW"
    return "PASS"
