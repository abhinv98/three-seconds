"""Rule checks from the measured disclosure track, per ASCI's influencer guidelines (pipeline/asci.py).

Unlisted ("Collab") and unknown frames never count as disclosed or as absent: a verdict they could
change is REVIEW. When the hold is within one 2 fps interval of the requirement, the label's edges are
re-read at 10 fps first (report.analyze_video); if any of those frames can't be read, label_duration
is REVIEW "Within measurement margin".

The audio checks use the transcript (pipeline/transcribe.py): label_language (1.3b) compares the label's
language with the speech's, and spoken_disclosure is PASS when a line says a disclosure, INFO otherwise.
"""

from __future__ import annotations

from collections.abc import Sequence

from models import Check, CheckVerdict, Evidence, Fix, Track, Verdict
from pipeline import asci
from pipeline.frames import EDGE_FPS
from pipeline.track import DISCLOSED, UNCERTAIN, longest, spans_where, state
from pipeline.transcribe import Audio
from pipeline.vision import FrameReading


def timecode(seconds: float) -> str:
    """00:03.0 style."""
    tenths = round(max(0.0, seconds) * 10)
    minutes, rest = divmod(tenths, 600)
    return f"{minutes:02d}:{rest / 10:04.1f}"


def seconds(x: float) -> str:
    """3.0s, 9.5s; 9.33s for a third of 28s, so a 9.3s hold doesn't read as meeting it."""
    return f"{x:.1f}s" if abs(x * 10 - round(x * 10)) < 1e-9 else f"{x:.2f}s"


def evaluate_rules(
    readings: list[FrameReading],
    track: Track,
    fps: float,
    duration_s: float,
    edge_readings: Sequence[FrameReading] = (),
    audio: Audio | None = None,
) -> list[Check]:
    """label_present, label_duration, label_language and spoken_disclosure, in that order.

    edge_readings are the 10 fps re-reads around the label's edges, already merged into readings; empty
    when the hold wasn't close enough to the requirement to need them. audio is None when it wasn't checked.
    """
    audio = audio or Audio(checked=False)
    return [
        _label_present(readings, track, fps, duration_s),
        _label_duration(readings, track, fps, duration_s, edge_readings),
        _label_language(readings, fps, duration_s, audio),
        _spoken_disclosure(audio),
    ]


LANGUAGE_NAMES = {"en": "English", "hi-Deva": "Hindi", "hi-Latn": "Hinglish", "und": "another language"}


def _spoken_disclosure(audio: Audio) -> Check:
    # INFO, never FAIL: ASCI asks for a spoken disclosure only in live streams (1.2f) and audio (1.2g).
    def check(verdict: CheckVerdict, detail: str, evidence: list[Evidence] | None = None) -> Check:
        return Check(
            id="spoken_disclosure",
            title="Spoken disclosure",
            verdict=verdict,
            detail=detail,
            clause=None,
            evidence=evidence or [],
        )

    if not audio.checked:
        return check("INFO", "Audio couldn't be checked this time." if audio.failed else "Audio not checked yet.")
    if not audio.has_track:
        return check("INFO", "This video has no audio.")
    if not audio.transcript:
        return check("INFO", "No speech heard.")
    line = next((s for s in audio.transcript if asci.said_out_loud(s.text)), None)
    if line is None:
        return check("INFO", "Not said out loud. ASCI asks for that only in live streams and audio ads.")
    note = f'"{line.text}" {LANGUAGE_NAMES.get(line.lang, "")}'.rstrip()
    return check(
        "PASS",
        f'Said at about {timecode(line.t_start)}: "{line.text}"',
        [Evidence(t_start=line.t_start, t_end=line.t_end, kind="audio", note=note)],
    )


def _label_language(readings: list[FrameReading], fps: float, duration_s: float, audio: Audio) -> Check:
    """1.3b: English, or the ad's own language. The ad's language is the speech's, by length."""

    def check(verdict: CheckVerdict, detail: str, evidence: list[Evidence], fix: str | None = None) -> Check:
        return Check(
            id="label_language",
            title="Label in English or the ad's language",
            verdict=verdict,
            detail=detail,
            clause=asci.LANGUAGE,
            evidence=evidence,
            fix=Fix(steps=[fix]) if fix else None,
        )

    shown = [r for r in readings if state(r) in DISCLOSED]
    if not shown:
        return check("INFO", "No label on screen, so there's no language to check.", [])
    texts = [r.label_text for r in shown]
    text = max(texts, key=texts.count)
    english = asci.label_language(text) == "en"
    span = spans_where(readings, DISCLOSED, fps, duration_s)[0]
    evidence = [
        Evidence(
            t_start=span.t_start,
            t_end=span.t_end,
            kind=shown[0].kind if shown[0].kind in ("label", "caption") else "label",
            note=f'Label text "{text}", {"English" if english else "Hindi"}',
        )
    ]
    lengths: dict[str, int] = {}
    for line in audio.transcript:
        lengths[line.lang] = lengths.get(line.lang, 0) + len(line.text)
    speech = max(lengths, key=lengths.__getitem__) if lengths else None
    if speech:
        name = LANGUAGE_NAMES.get(speech, speech)
        evidence.append(
            Evidence(
                t_start=audio.transcript[0].t_start,
                t_end=audio.transcript[-1].t_end,
                kind="audio",
                note=f"Speech, mostly {name}",
            )
        )
    if english:
        said = f" Speech is {LANGUAGE_NAMES.get(speech, speech)}." if speech else ""
        return check("PASS", f"Disclosure uses English, which ASCI accepts for an ad in any language.{said}", evidence)
    if speech is None:
        return check("INFO", "Label is in Hindi. ASCI accepts that if the ad is in Hindi too.", evidence)
    if speech.startswith("hi"):
        return check("PASS", f"Label is in Hindi, like the speech ({LANGUAGE_NAMES[speech]}).", evidence)
    return check(
        "REVIEW",
        f"Label is in Hindi but the speech is {LANGUAGE_NAMES.get(speech, speech)}."
        " ASCI wants English or the ad's own language.",
        evidence,
        'Add the label in English as well, for example "Ad" or "Paid partnership".',
    )


def _evidence(readings: list[FrameReading], fps: float, duration_s: float, *states: str) -> list[Evidence]:
    """One evidence item per run of frames in each state, in time order."""
    items = []
    for s in states:
        for span in spans_where(readings, {s}, fps, duration_s):
            inside = [r for r in readings if span.t_start <= r.t < span.t_end]
            if s == "unknown":
                items.append(
                    Evidence(t_start=span.t_start, t_end=span.t_end, kind="frame", note="Frames could not be read")
                )
                continue
            text = max((r.label_text for r in inside), key=[r.label_text for r in inside].count)
            kind = "caption" if s == "caption" or inside[0].kind == "caption" else "label"
            position = max((r.position for r in inside), key=[r.position for r in inside].count)
            illegible = sum(r.legible is False for r in inside)
            note = f'"{text}" {kind}' if text else f"Unreadable {kind}"
            note += f", {position}" if position else ""
            note += ", not a 1.3a label" if s == "unlisted" else ""
            note += f", hard to read in {illegible} frames" if illegible else ""
            items.append(Evidence(t_start=span.t_start, t_end=span.t_end, kind=kind, note=note))
    return sorted(items, key=lambda e: e.t_start)


def _label_present(readings: list[FrameReading], track: Track, fps: float, duration_s: float) -> Check:
    def check(verdict: CheckVerdict, detail: str, evidence: list[Evidence], fix: str | None = None) -> Check:
        return Check(
            id="label_present",
            title="Disclosure label on screen",
            verdict=verdict,
            detail=detail,
            clause=asci.LABELS,
            evidence=evidence,
            fix=Fix(steps=[fix]) if fix else None,
        )

    states = [state(r) for r in readings]
    if track.spans:
        first = next(r for r in readings if state(r) in DISCLOSED)
        detail = f'"{first.label_text}" {first.kind} on screen from {timecode(track.spans[0].t_start)}.'
        return check("PASS", detail, _evidence(readings, fps, duration_s, "label", "caption"))
    if "unlisted" in states:
        texts = sorted({r.label_text for r in readings if state(r) == "unlisted" and r.label_text})
        shown = ", ".join(f'"{t}"' for t in texts) or "Disclosure-like text"
        return check(
            "REVIEW",
            f'{shown} is not one of the labels ASCI 1.3a permits, such as "Collaboration" or "Paid partnership".',
            _evidence(readings, fps, duration_s, "unlisted", "unknown"),
            'Use a permitted label, for example "Collaboration", "Paid partnership" or "Ad".',
        )
    if "unknown" in states:
        return check(
            "REVIEW",
            f"No label found, but {states.count('unknown')} of {len(readings)} frames could not be read.",
            _evidence(readings, fps, duration_s, "unknown"),
            "Check the unread stretches by eye, or run the check again.",
        )
    return check(
        "FAIL",
        "No disclosure label on screen.",
        [],
        'Add a permitted label such as "Paid partnership" or "Ad", on screen from the first second.',
    )


def _label_duration(
    readings: list[FrameReading], track: Track, fps: float, duration_s: float, edge_readings: Sequence[FrameReading]
) -> Check:
    evidence = _evidence(readings, fps, duration_s, "label", "caption", "unlisted", "unknown")
    held, total = track.longest_continuous_s, track.total_on_screen_s
    need, clause = asci.required_hold(duration_s)
    at_most = longest(spans_where(readings, DISCLOSED | UNCERTAIN, fps, duration_s))
    measured = f" (edges measured at {EDGE_FPS:g} fps)" if edge_readings else ""
    needs = f"this {duration_s:.1f}s video needs {seconds(need)}."
    on_screen = f"On screen {total:.1f}s in all."
    unread_edges = sum(r.label_present is None for r in edge_readings)
    verdict: Verdict
    fix = None
    if unread_edges:
        verdict = "REVIEW"
        fix = Fix(steps=["Check where the label starts and ends by eye; a fraction of a second decides this check."])
        detail = (
            f"Within measurement margin. Label held about {held:.1f}s in one stretch and {needs}"
            f" {unread_edges} frames at its edges could not be read at {EDGE_FPS:g} fps."
        )
    elif held >= need:
        verdict, detail = "PASS", f"Label held {held:.1f}s in one stretch{measured}; {needs} {on_screen}"
    elif at_most < need:
        verdict = "FAIL"
        fix = Fix(steps=[f"Keep a permitted label on screen for at least {seconds(need)} without a break."])
        if track.spans:
            detail = f"Label held {held:.1f}s at most in one stretch{measured}; {needs} {on_screen}"
        else:
            detail = f"No permitted label on screen; {needs}"
    else:
        verdict = "REVIEW"
        fix = Fix(steps=["Check the unread or unlisted stretches by eye; they decide this check."])
        detail = (
            f"Label held {held:.1f}s for sure, up to {at_most:.1f}s counting unread or unlisted frames; {needs}"
            f" {on_screen}"
        )
    return Check(
        id="label_duration",
        title="Label held long enough",
        verdict=verdict,
        detail=detail,
        clause=clause,
        evidence=evidence,
        fix=fix,
    )


def overall_verdict(checks: list[Check]) -> Verdict:
    """FAIL if any check fails, else REVIEW if any needs review, else PASS. INFO checks don't count."""
    verdicts = {c.verdict for c in checks}
    if "FAIL" in verdicts:
        return "FAIL"
    if "REVIEW" in verdicts:
        return "REVIEW"
    return "PASS"
