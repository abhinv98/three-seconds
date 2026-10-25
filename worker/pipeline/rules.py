"""Rule checks with Muse Spark.

The real stage gives Muse Spark the tracks, the transcript and the ASCI influencer guideline text,
and asks it to decide each check with a cited clause. Clause codes and thresholds must come from
the verified guideline; until then every check cites ASCI-PENDING.

Stub: returns the fixture's checks. No model is called.
"""

from __future__ import annotations

from models import Check, Track, TranscriptSegment, Verdict
from pipeline.fixture import load_fixture


def evaluate_rules(tracks: list[Track], transcript: list[TranscriptSegment], duration_s: float) -> list[Check]:
    """Run the four disclosure checks.

    Args:
        tracks: Output of track.track_objects.
        transcript: Output of transcribe.transcribe.
        duration_s: Video length in seconds.

    Returns:
        label_present, label_duration, spoken_disclosure and label_language, in that order.
    """
    return [Check.model_validate(c) for c in load_fixture()["checks"]]


def overall_verdict(checks: list[Check]) -> Verdict:
    """FAIL if any check fails, else REVIEW if any needs review, else PASS."""
    verdicts = {c.verdict for c in checks}
    if "FAIL" in verdicts:
        return "FAIL"
    if "REVIEW" in verdicts:
        return "REVIEW"
    return "PASS"
