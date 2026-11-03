"""The finer-details video work: SAM 3.1 output parsing, clip windows, box prompts and track spans."""

from meta_api import SamBox, parse_sam_records, read_sam_stream
from pipeline.details import MAX_TRACK_S, box_prompt, spans_from_boxes, window


def test_parse_sam_records_reads_boxes_and_skips_masks():
    # A mask payload that happens to contain "<3f>" must not start a new frame.
    text = "<12f>1<|box;x1=10;y1=20;x2=29;y2=39;w=540;h=960;c=0.9|><|mask;x=0;y=0;c=0.9;data=20,20,!<3f>2x|>,"
    text += "2<|box;x1=1;y1=2;x2=3;y2=4;w=540;h=960|>"
    boxes = parse_sam_records(text)
    assert boxes == [
        SamBox(12, 1, 10, 20, 29, 39, 540, 960, 0.9),
        SamBox(12, 2, 1, 2, 3, 4, 540, 960, None),
    ]


def test_read_sam_stream_collects_deltas_and_frames_billed():
    lines = [
        b"event: response.output_text.delta",
        b'data: {"type": "response.output_text.delta", "delta": "<3f>1<|box;x1=0;y1=0;x2=9;y2=9;w=100;h=100|>"}',
        b"",
        b'data: {"type": "response.completed", "response": {"usage": {"video_frames_processed": 90}}}',
    ]
    boxes, frames = read_sam_stream(lines)
    assert [b.frame for b in boxes] == [3]
    assert frames == 90


def test_window_pads_caps_and_contains_t():
    assert window(20, 18.9, 21.6, 60) == (18.65, 21.85)
    assert window(0.1, 0, 2, 60) == (0.0, 2.25)
    a, b = window(30, 0, 60, 60)
    assert b - a == MAX_TRACK_S and a <= 30 <= b


def test_box_prompt_uses_clip_pixels():
    assert box_prompt([0.5, 0.25, 0.1, 0.1], 7, 540, 960) == "<7f>1<|box;x1=270;y1=240;x2=323;y2=335;w=540;h=960|>"


def test_spans_split_on_gaps_and_keep_every_third_frame():
    boxes = [SamBox(f, 1, 0, 0, 53, 95, 540, 960, 0.8) for f in [*range(0, 8), *range(20, 22)]]
    spans = spans_from_boxes(boxes, start_s=10.0)
    assert [(s["t_start"], s["t_end"]) for s in spans] == [(10.0, 10.533), (11.333, 11.467)]
    assert [k["t"] for k in spans[0]["boxes"]] == [10.0, 10.2, 10.4, 10.467]
    assert spans[0]["boxes"][0]["box"] == [0.0, 0.0, 0.1, 0.1]
