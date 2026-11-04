import io
import json
import subprocess

import pytest

import llm
from models import Check
from pipeline.frames import Frame, sample_frames
from pipeline.report import analyze_video
from pipeline.rules import evaluate_rules, overall_verdict
from pipeline.track import label_track
from pipeline.vision import FrameReading, parse_readings, read_frames

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


def test_a_batch_that_times_out_twice_is_unknown_and_the_other_batches_stand(monkeypatch, tmp_path):
    """Two batches: the second never answers. The check goes on, with those frames unknown rather than absent."""
    monkeypatch.delenv("PROVIDER", raising=False)
    monkeypatch.setenv("BASETEN_API_KEY", "b10_test")
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    lost = []

    def urlopen(request, timeout):
        if '"t=4.0"' in request.data.decode():
            lost.append(request)
            raise TimeoutError("timed out")
        answer = json.dumps([{"t": i / 2, "label_present": False} for i in range(8)])
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": answer}, "finish_reason": "stop"}]}).encode())

    monkeypatch.setattr(llm.urllib.request, "urlopen", urlopen)
    jpeg = tmp_path / "frame.jpg"
    jpeg.write_bytes(b"jpeg")
    readings, replies = read_frames([Frame(t=i / 2, path=jpeg) for i in range(10)])

    assert [r.label_present for r in readings] == [False] * 8 + [None] * 2
    assert len(replies) == 1
    assert len(lost) == 2


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
        check.detail == "Label held 5.0s at most in one stretch; this 28.0s video needs 9.33s. On screen 10.0s in all."
    )


def test_unknown_or_unlisted_frames_turn_a_would_be_fail_into_review():
    assert checks_for(12, "L" * 4 + "??")["label_duration"].verdict == "REVIEW"  # 2.0s sure, 3.0s at most
    assert checks_for(12, "L" * 4 + "XX")["label_duration"].verdict == "REVIEW"
    assert checks_for(12, "L" * 4 + "?")["label_duration"].verdict == "FAIL"  # 2.5s at most


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
    assert (checks["spoken_disclosure"].verdict, checks["spoken_disclosure"].detail) == (
        "INFO",
        "Audio not checked yet.",
    )
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


@pytest.fixture(scope="module")
def blank_12s(tmp_path_factory):
    """A 12s video; fake_model decides what each frame shows."""
    video = tmp_path_factory.mktemp("video") / "blank.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=32x32:r=30:d=12", "-pix_fmt", "yuv420p"]
        + [str(video)],
        check=True,
    )
    return video


def fake_model(monkeypatch, label_from: float, label_to: float, answer_off_grid: bool = True) -> list[float]:
    """The model sees "Paid partnership" for label_from <= t < label_to. Returns every t it was asked about.

    With answer_off_grid=False it gives no answer for frames between the 2 fps slots (10 fps edge frames).
    """
    asked: list[float] = []

    def chat(messages, **params):
        times = [
            float(p["text"][2:]) for p in messages[0]["content"] if p["type"] == "text" and p["text"].startswith("t=")
        ]
        asked.extend(times)
        rows = [
            {"t": t, "label_present": label_from <= t < label_to, "kind": "label", "label_text": "Paid partnership"}
            for t in times
            if answer_off_grid or (t * 2).is_integer()
        ]
        return llm.Reply(json.dumps(rows), 1000, 100, 0.002)

    monkeypatch.setattr(llm, "chat", chat)
    return asked


@pytest.mark.parametrize(
    ("label_from", "label_to", "held", "verdict", "edge_frames"),
    [
        # 2 fps sees 0.5-3.5 (3.0s, a PASS for 3s); 10 fps finds 0.4-3.3, 2.9s: FAIL.
        (
            0.35,
            3.3,
            2.9,
            "FAIL",
            [round(0.1 * k, 1) for k in range(11)] + [round(0.1 * k, 1) for k in range(30, 41)],
        ),
        # 2 fps sees 0.0-3.5 (3.5s); the start is the video's, so only the end is re-read: 3.3s, PASS.
        (0.0, 3.25, 3.3, "PASS", [round(0.1 * k, 1) for k in range(30, 41)]),
        # 2 fps sees 2.0s, a whole interval short of 3s: no re-read.
        (0.0, 1.85, 2.0, "FAIL", []),
    ],
)
def test_edges_are_re_read_at_10_fps_when_the_hold_is_within_half_a_second(
    monkeypatch, blank_12s, label_from, label_to, held, verdict, edge_frames
):
    asked = fake_model(monkeypatch, label_from, label_to)
    analysis = analyze_video(blank_12s, "blank.mp4", "local")
    [track] = analysis.report.tracks
    duration = next(c for c in analysis.report.checks if c.id == "label_duration")
    assert (track.longest_continuous_s, duration.verdict) == (held, verdict)
    assert [r.t for r in analysis.edge_readings] == edge_frames
    assert len(asked) == 24 + len(edge_frames)  # 2 fps over 12s, then the edges
    assert len(analysis.edge_replies) == -(-len(edge_frames) // 8)
    assert ("edges measured at 10 fps" in duration.detail) == bool(edge_frames)


def test_unreadable_edge_frames_are_within_measurement_margin(monkeypatch, blank_12s):
    fake_model(monkeypatch, 0.35, 3.3, answer_off_grid=False)
    analysis = analyze_video(blank_12s, "blank.mp4", "local")
    duration = next(c for c in analysis.report.checks if c.id == "label_duration")
    assert duration.verdict == "REVIEW"
    assert duration.detail.startswith("Within measurement margin.")
    assert sum(r.label_present is None for r in analysis.edge_readings) == 16  # 22 edge frames, 6 on the 2 fps grid
