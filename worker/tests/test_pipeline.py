import subprocess

import pytest

from models import Check
from pipeline.frames import sample_frames
from pipeline.rules import evaluate_rules, overall_verdict
from pipeline.track import label_track
from pipeline.vision import FrameReading, parse_readings

TIMES = [0.0, 0.5, 1.0, 1.5]
FRAME = {
    "L": {"label_present": True, "kind": "label", "label_text": "Paid partnership with Nike"},
    "H": {"label_present": True, "kind": "label", "label_text": "प्रायोजित"},
    "C": {"label_present": True, "kind": "caption", "label_text": "Yeh video sponsored hai."},
    "X": {"label_present": True, "kind": "label", "label_text": "Collab"},
    "?": {"label_present": None},
    "-": {"label_present": False},
}


def checks_for(duration_s: float, frames: str) -> dict[str, Check]:
    """frames: one character per 0.5s from t=0 (see FRAME), padded with "-" to the video's length."""
    frames = frames.ljust(int(duration_s * 2), "-")
    readings = [FrameReading(i / 2, **FRAME[c]) for i, c in enumerate(frames)]
    checks = evaluate_rules(readings, label_track(readings, 2.0, duration_s), 2.0, duration_s)
    return {c.id: c for c in checks}


def test_parse_readings_survives_prose_fences_and_missing_frames():
    text = """I can see the frames. ```json
    [{"t": 0, "label_present": true, "kind": "caption", "label_text": "Sponsored hai", "language": "hi-Latn", "legible": "true"},
     {"t": "0.5s", "label_present": "false"},
     {"t": 1.0, "label_present": "maybe"}]
    ``` Frame 1.5 is too blurry to judge."""
    readings = parse_readings(text, TIMES)
    assert [r.label_present for r in readings] == [True, False, None, None]
    assert (readings[0].kind, readings[0].label_text, readings[0].legible) == ("caption", "Sponsored hai", True)


def test_parse_readings_matches_in_order_when_timestamps_are_missing_and_gives_up_on_garbage():
    rows = '{"frames": [{"label_present": true}, {"label_present": false}, {"label_present": false}, {}]}'
    assert [r.label_present for r in parse_readings(rows, TIMES[:3])] == [True, False, False]
    assert [r.label_present for r in parse_readings("I can't see any images.", TIMES)] == [None] * 4


@pytest.mark.parametrize(
    ("duration_s", "frames_needed", "clause"),
    [
        (12, 6, "ASCI-IG 1.2e.I"),  # 3.0s
        (15, 6, "ASCI-IG 1.2e.I"),  # 3.0s, 15s is still "15 seconds or less"
        (16, 11, "ASCI-IG 1.2e.II"),  # 16/3 = 5.33s, so 5.5s
        (28, 19, "ASCI-IG 1.2e.II"),  # 28/3 = 9.33s, so 9.5s
    ],
)
def test_label_duration_follows_1_2e(duration_s, frames_needed, clause):
    passing = checks_for(duration_s, "L" * frames_needed)["label_duration"]
    failing = checks_for(duration_s, "L" * (frames_needed - 1))["label_duration"]
    assert (passing.verdict, failing.verdict) == ("PASS", "FAIL")
    assert passing.clause.code == failing.clause.code == clause
    assert failing.fix is not None


def test_label_duration_uses_the_longest_stretch_not_the_total():
    check = checks_for(28, "L" * 10 + "-" * 4 + "L" * 10)["label_duration"]  # 5s + 5s
    assert check.verdict == "FAIL"
    assert (
        check.detail == "Label held 5.0s at most in one stretch; this 28.0s video needs 9.3s. On screen 10.0s in all."
    )


def test_unknown_or_unlisted_frames_turn_a_would_be_fail_into_review():
    assert checks_for(12, "L" * 4 + "??")["label_duration"].verdict == "REVIEW"  # 2.0s sure, 3.0s at most
    assert checks_for(12, "L" * 4 + "XX")["label_duration"].verdict == "REVIEW"
    assert checks_for(12, "L" * 4 + "?")["label_duration"].verdict == "FAIL"  # 2.5s at most


def test_over_two_minutes_is_outside_mvp_scope():
    check = checks_for(121, "L" * 200)["label_duration"]
    assert (check.verdict, check.clause) == ("REVIEW", None)
    assert "outside MVP scope" in check.detail


@pytest.mark.parametrize(
    ("frames", "verdict", "evidence_kind"),
    [
        ("LLLLLL", "PASS", "label"),
        ("HHHHHH", "PASS", "label"),  # Hindi equivalent
        ("CCCCCC", "PASS", "caption"),  # a caption with a 1.3a word counts
        ("XXXXXX", "REVIEW", "label"),  # "Collab" alone
        ("??????", "REVIEW", "frame"),
        ("", "FAIL", None),
    ],
)
def test_label_present_needs_a_1_3a_label(frames, verdict, evidence_kind):
    check = checks_for(12, frames)["label_present"]
    assert check.verdict == verdict
    assert check.clause.code == "ASCI-IG 1.3a"
    assert [e.kind for e in check.evidence][:1] == ([evidence_kind] if evidence_kind else [])


def test_spoken_disclosure_is_info_and_never_decides_the_verdict():
    checks = checks_for(12, "L" * 6)
    assert checks["spoken_disclosure"].verdict == "INFO"
    assert overall_verdict(list(checks.values())) == "PASS"


def test_sampled_frame_shows_the_video_at_its_timestamp(tmp_path):
    """Red until 2.1s, then blue: the frame stamped 2.0s must still be red."""
    video = tmp_path / "rb.mp4"
    color = "geq=r='if(lt(T,2.1),255,0)':g=0:b='if(lt(T,2.1),0,255)'"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:s=32x32:r=30:d=4,format=rgb24,{color}"]
        + ["-pix_fmt", "yuv420p", str(video)],
        check=True,
    )
    frames = {f.t: f.path for f in sample_frames(video, tmp_path)}

    def red(path):
        rgb = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            check=True,
            capture_output=True,
        ).stdout
        return rgb[0] > rgb[2]

    assert [red(frames[t]) for t in (1.5, 2.0, 2.5)] == [True, True, False]
