from pipeline.rules import evaluate_rules
from pipeline.track import label_track
from pipeline.vision import FrameReading, parse_readings

TIMES = [0.0, 0.5, 1.0, 1.5]


def test_parse_readings_survives_prose_fences_and_missing_frames():
    text = """I can see the frames. ```json
    [{"t": 0, "label_present": true, "label_text": "Paid partnership", "language": "en", "legible": "true"},
     {"t": "0.5s", "label_present": "false"},
     {"t": 1.0, "label_present": "maybe"}]
    ``` Frame 1.5 is too blurry to judge."""
    readings = parse_readings(text, TIMES)
    assert [r.label_present for r in readings] == [True, False, None, None]
    assert (readings[0].label_text, readings[0].language, readings[0].legible) == ("Paid partnership", "en", True)


def test_parse_readings_matches_in_order_when_timestamps_are_missing_and_gives_up_on_garbage():
    rows = '{"frames": [{"label_present": true}, {"label_present": false}, {"label_present": false}, {}]}'
    assert [r.label_present for r in parse_readings(rows, TIMES[:3])] == [True, False, False]
    assert [r.label_present for r in parse_readings("I can't see any images.", TIMES)] == [None] * 4


def verdicts(present: list[bool | None]) -> dict[str, str]:
    readings = [FrameReading(i / 2, p) for i, p in enumerate(present)]
    duration = len(present) / 2
    checks = evaluate_rules(readings, label_track(readings, 2.0, duration), 2.0, duration)
    return {c.id: c.verdict for c in checks}


def test_unknown_frames_turn_a_would_be_fail_into_review_but_never_into_pass():
    t, f, u = True, False, None
    assert verdicts([t] * 6 + [f] * 4) == {
        "label_present": "PASS",
        "label_duration": "PASS",
        "spoken_disclosure": "REVIEW",
    }
    assert verdicts([t] * 4 + [f] * 6)["label_duration"] == "FAIL"  # 2.0s < 3s
    assert verdicts([t] * 4 + [u] * 2 + [f] * 4)["label_duration"] == "REVIEW"  # 2.0s sure, 3.0s at most
    assert verdicts([f] * 8 + [u] * 2) == {
        "label_present": "REVIEW",
        "label_duration": "FAIL",
        "spoken_disclosure": "REVIEW",
    }
    assert verdicts([f] * 10)["label_present"] == "FAIL"
