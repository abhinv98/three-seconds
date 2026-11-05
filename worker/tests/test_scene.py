"""POST /scene: SAM 3.1 over a mocked connection, the size guard, and real ffmpeg on generated clips."""

import base64
import http.client
import json
import re
import subprocess
import threading
import time
import urllib.error
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
import meta_api
from pipeline import details, scene, transcribe
from pipeline.frames import VideoError, probe, sample_frames

client = TestClient(main.app)
MASK = "<|mask;x=0;y=0;c=0.9;data=2,2,!abc|>"
BOX = "<|box;x1=0;y1=0;x2=9;y2=9;w=540;h=960;c=0.9|>"
COMPLETED = {"type": "response.completed", "response": {"usage": {"video_frames_processed": 500}}}


def sse(*events):
    return [b"data: " + json.dumps(e).encode() + b"\n" for e in events]


def delta(frame):
    return {"type": "response.output_text.delta", "delta": f"<{frame}f>0{BOX}{MASK}\n"}


class Stream:
    """What urlopen returns: byte lines, then whatever the connection does at the end."""

    def __init__(self, lines, then=None):
        self.lines, self.then = lines, then

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        yield from self.lines
        if self.then:
            raise self.then

    def read(self):
        if self.then:
            raise self.then
        return b"".join(self.lines)


@pytest.fixture
def http_answers(monkeypatch):
    """Answers urlopen in turn from the list the test fills; `sent` holds each request's JSON body."""
    monkeypatch.setenv("META_API_KEY", "test")
    monkeypatch.setattr(meta_api.time, "sleep", lambda _: None)
    answers, sent = [], []

    def urlopen(request, timeout):
        sent.append(request.data)
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(meta_api.urllib.request, "urlopen", urlopen)
    return answers, sent


def test_sam_segment_sends_a_text_concept_and_returns_raw_lines(http_answers):
    answers, sent = http_answers
    answers.append(Stream(sse(delta(3), delta(9), COMPLETED)))
    lines, cost = meta_api.sam_segment(b"mp4", "sunglasses")
    assert lines == [f"<3f>0{BOX}{MASK}", f"<9f>0{BOX}{MASK}"]
    assert cost == pytest.approx(0.1)
    body = json.loads(sent[0])
    assert (body["model"], body["store"], body["stream"]) == ("sam-3.1", False, True)
    assert body["metadata"] == {"include_confidence": "true", "mask_encoding": "one_bit"}
    text, video = body["input"][0]["content"]
    assert text == {"type": "input_text", "text": "sunglasses"}
    assert video["video_url"] == "data:video/mp4;base64," + base64.b64encode(b"mp4").decode()


def test_a_failure_event_mid_stream_is_an_error_and_is_not_retried(http_answers):
    answers, sent = http_answers
    answers.append(Stream(sse(delta(1), {"type": "response.failed", "response": {"error": {"code": "boom"}}})))
    with pytest.raises(meta_api.MetaAPIError, match="boom"):
        meta_api.sam_segment(b"mp4", "person")
    assert len(sent) == 1


DROPS = [
    http.client.RemoteDisconnected("closed"),
    ConnectionResetError("reset"),
    http.client.IncompleteRead(b"partial"),
    TimeoutError("timed out"),
]


@pytest.mark.parametrize("drop", DROPS, ids=lambda e: type(e).__name__)
def test_a_dropped_stream_is_retried_then_becomes_a_meta_api_error(http_answers, drop):
    answers, sent = http_answers
    answers.extend([Stream(sse(delta(1)), then=drop), drop, Stream(sse(delta(2), COMPLETED))])
    assert meta_api.sam_segment(b"mp4", "person")[0] == [f"<2f>0{BOX}{MASK}"]
    assert len(sent) == 3

    answers.clear()
    answers.extend([Stream(sse(delta(1)), then=drop) for _ in range(3)])
    with pytest.raises(meta_api.MetaAPIError):
        meta_api.sam_segment(b"mp4", "person")


def test_a_stream_that_ends_without_completed_is_not_taken_as_the_whole_answer(http_answers):
    answers, sent = http_answers
    answers.extend([Stream(sse(delta(1))) for _ in range(3)])
    with pytest.raises(meta_api.MetaAPIError, match="before response.completed"):
        meta_api.sam_segment(b"mp4", "person")
    assert len(sent) == 3


def test_sam_track_shares_the_fix(http_answers):
    answers, _ = http_answers
    answers.extend([Stream([], then=http.client.IncompleteRead(b"")) for _ in range(3)])
    with pytest.raises(meta_api.MetaAPIError):
        meta_api.sam_track(b"mp4", "<0f>1<|box;x1=0;y1=0;x2=1;y2=1;w=2;h=2|>")
    answers.append(Stream(sse(delta(4), COMPLETED)))
    boxes, _ = meta_api.sam_track(b"mp4", "<0f>1<|box;x1=0;y1=0;x2=1;y2=1;w=2;h=2|>")
    assert [b.frame for b in boxes] == [4]


def test_sam_gives_up_at_the_deadline(http_answers, monkeypatch):
    answers, sent = http_answers
    now = meta_api.time.monotonic()
    with pytest.raises(meta_api.MetaAPIError, match="out of time"):
        meta_api.sam_segment(b"mp4", "person", deadline=now - 1)
    assert sent == []

    answers.append(Stream(sse(delta(1), delta(2), COMPLETED)))
    times = iter([now, now + 2, now + 2, now + 2])
    monkeypatch.setattr(meta_api.time, "monotonic", lambda: next(times))
    with pytest.raises(meta_api.MetaAPIError, match="out of time"):
        meta_api.sam_segment(b"mp4", "person", deadline=now + 1)


@pytest.mark.parametrize("drop", DROPS, ids=lambda e: type(e).__name__)
def test_transcribe_turns_a_dropped_connection_into_a_meta_api_error(http_answers, drop):
    answers, _ = http_answers
    answers.extend([Stream([], then=drop), drop, Stream([], then=drop)])
    with pytest.raises(meta_api.MetaAPIError):
        meta_api.transcribe(b"RIFF")

    answers.extend([drop, Stream([b'{"audioDurationMs": 2000, "turns": []}'])])
    assert meta_api.transcribe(b"RIFF")[0]["audioDurationMs"] == 2000


def test_an_error_body_lost_midway_is_still_a_meta_api_error(http_answers):
    answers, _ = http_answers

    class Lost(urllib.error.HTTPError):
        def read(self):
            raise http.client.IncompleteRead(b"")

    answers.append(Lost("https://api.meta.ai", 400, "Bad Request", {}, None))
    with pytest.raises(meta_api.MetaAPIError, match="HTTP 400"):
        meta_api.sam_segment(b"mp4", "person")


def test_strip_masks_keeps_the_boxes():
    line = f"<7f>0{BOX}{MASK},1{BOX}<|mask;x=0;y=0;data=9,9,~$%&'|>"
    assert meta_api.strip_masks(line) == f"<7f>0{BOX},1{BOX}"


def body(lines, error=None):
    return {"lines": lines, "error": error}


def test_fit_leaves_a_small_response_alone():
    response = {"concepts": {"person": body(["a"] * 4)}, "thinned": {}}
    assert scene.fit(response)["thinned"] == {}
    assert len(response["concepts"]["person"]["lines"]) == 4


def test_fit_drops_every_other_person_frame_and_says_so(monkeypatch):
    monkeypatch.setattr(scene, "MAX_RESPONSE_BYTES", 6000)
    person = [f"<{i}f>" + "x" * 96 for i in range(100)]
    response = {"concepts": {"person": body(person), "face": body(["y" * 100] * 4)}, "thinned": {}}
    scene.fit(response)
    assert response["thinned"] == {"person": 2}
    assert response["concepts"]["person"]["lines"] == person[::2]
    assert len(response["concepts"]["face"]["lines"]) == 4
    assert len(json.dumps(response, separators=(",", ":"))) <= 6000


def test_fit_keeps_a_real_size_response_under_4_mb():
    response = {"concepts": {"person": body(["x" * 1000] * 5000)}, "sprite": {"jpeg": "y" * 500_000}, "thinned": {}}
    scene.fit(response)
    assert response["thinned"] == {"person": 2}
    assert len(json.dumps(response, separators=(",", ":"))) < 4_000_000


def test_fit_moves_to_the_biggest_concept_once_person_has_given_a_frame(monkeypatch):
    monkeypatch.setattr(scene, "MAX_RESPONSE_BYTES", 3000)
    response = {
        "concepts": {"person": body(["p" * 100] * 8), "product": body(["q" * 100] * 80)},
        "thinned": {},
    }
    scene.fit(response)
    assert response["thinned"] == {"person": 2, "product": 4}
    assert len(json.dumps(response, separators=(",", ":"))) <= 3000


def test_fit_stops_when_nothing_is_left_to_thin(monkeypatch):
    monkeypatch.setattr(scene, "MAX_RESPONSE_BYTES", 10)
    response = {"concepts": {"person": body(["p" * 100])}, "thinned": {}}
    assert scene.fit(response)["concepts"]["person"]["lines"] == ["p" * 100]


CLIP_W, CLIP_H = 180, 320


@pytest.fixture(scope="module")
def reel(tmp_path_factory):
    """6 s: black for 2 s, white for 2 s, black again, so two hard cuts. A tone plays for the first 3 s only."""
    path = tmp_path_factory.mktemp("scene") / "reel.mp4"
    size = f"s={CLIP_W}x{CLIP_H}:r=30"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:{size}:d=2"]
        + ["-f", "lavfi", "-i", f"color=c=white:{size}:d=2", "-f", "lavfi", "-i", f"color=c=black:{size}:d=2"]
        + ["-f", "lavfi", "-i", "sine=f=440:d=3,apad=whole_dur=6"]
        + ["-filter_complex", "[0][1][2]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a"]
        + ["-pix_fmt", "yuv420p", "-t", "6", str(path)],
        check=True,
    )
    return path


@pytest.fixture(scope="module")
def silent_reel(tmp_path_factory):
    path = tmp_path_factory.mktemp("silent") / "silent.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=gray:s={CLIP_W}x{CLIP_H}:r=30:d=2"]
        + ["-pix_fmt", "yuv420p", str(path)],
        check=True,
    )
    return path


def fake_sam(monkeypatch, fail=()):
    seen = []

    def sam_segment(mp4, phrase, *, deadline=None):
        seen.append((mp4, phrase, deadline))
        if phrase in fail:
            raise meta_api.MetaAPIError("sam-3.1: HTTP 500: raw detail from upstream")
        return [f"<0f>0{BOX}{MASK}", f"<1f>0{BOX}{MASK}"], 0.1

    monkeypatch.setattr(meta_api, "sam_segment", sam_segment)
    return seen


CONCEPTS = [
    {"id": "person", "phrase": "person", "masks": True},
    {"id": "face", "phrase": "face", "masks": False},
    {"id": "product", "phrase": "sunglasses", "masks": True},
]


def test_shots_finds_each_hard_cut(reel):
    assert scene.shots(reel) == pytest.approx([2.0, 4.0], abs=0.07)


def test_a_flash_between_two_shots_counts_as_one_cut(tmp_path):
    video = tmp_path / "flash.mp4"
    size = f"s={CLIP_W}x{CLIP_H}:r=30"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:{size}:d=1"]
        + ["-f", "lavfi", "-i", f"color=c=white:{size}:d=0.034", "-f", "lavfi", "-i", f"color=c=black:{size}:d=1"]
        + ["-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-pix_fmt", "yuv420p", str(video)],
        check=True,
    )
    assert scene.shots(video) == pytest.approx([1.0], abs=0.07)


def test_waveform_is_a_peak_per_tenth_of_a_second(reel, silent_reel):
    wave = scene.waveform(reel, 6.0)
    assert len(wave) == pytest.approx(60, abs=1)
    assert all(0 <= v <= 255 for v in wave)
    assert min(wave[2:28]) > 20
    assert max(wave[32:]) == 0
    assert scene.waveform(silent_reel, 2.0) == []


def test_sprite_tiles_show_the_reel_at_their_times_and_fit(reel, tmp_path):
    sheet = scene.sprite(reel, 6.0, CLIP_W, CLIP_H)
    assert (sheet["tile_w"], sheet["tile_h"], sheet["every_s"]) == (90, 160, 0.25)
    assert (sheet["cols"], sheet["rows"]) == (20, 2)
    jpeg = base64.b64decode(sheet["jpeg"])
    assert len(jpeg) < scene.MAX_SPRITE_BYTES
    path = tmp_path / "sheet.jpg"
    path.write_bytes(jpeg)

    def brightness(t):
        i = round(t / sheet["every_s"])
        x, y = (i % sheet["cols"]) * sheet["tile_w"], (i // sheet["cols"]) * sheet["tile_h"]
        crop = f"crop={sheet['tile_w']}:{sheet['tile_h']}:{x}:{y},scale=1:1"
        return subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-vf", crop, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
            check=True,
            capture_output=True,
        ).stdout[0]

    assert [brightness(t) > 128 for t in (1.5, 2.5, 3.5, 4.5)] == [False, True, True, False]


def test_sprite_widens_every_s_until_the_jpeg_fits(reel, monkeypatch):
    sizes = []

    def run_ffmpeg(args):
        sizes.append(args)
        return b"x" * (scene.MAX_SPRITE_BYTES + (-1 if len(sizes) > 2 else 1))

    monkeypatch.setattr(scene, "run_ffmpeg", run_ffmpeg)
    sheet = scene.sprite(reel, 90.0, 540, 960)
    assert len(sizes) == 3
    assert sheet["every_s"] == pytest.approx(0.75 * 1.25 * 1.25, abs=0.002)
    assert sheet["cols"] * sheet["rows"] >= 90 / sheet["every_s"]


def test_build_scene_cuts_once_shares_the_bytes_and_strips_masks_where_asked(reel, monkeypatch):
    seen = fake_sam(monkeypatch)
    cuts = []
    real_cut = scene.cut
    monkeypatch.setattr(scene, "cut", lambda *a: (cuts.append(a), real_cut(*a))[1])
    out = scene.build_scene(reel, CONCEPTS, fps=10, width=180)

    assert len(cuts) == 1
    assert len({id(mp4) for mp4, _, _ in seen}) == 1
    assert sorted(phrase for _, phrase, _ in seen) == ["face", "person", "sunglasses"]
    assert seen[0][0][4:8] == b"ftyp"
    assert seen[0][2] > 0

    assert (out["width"], out["height"], out["fps"]) == (180, 320, 10)
    assert out["duration_s"] == pytest.approx(6.0, abs=0.1)
    assert out["concepts"]["person"]["lines"][0] == f"<0f>0{BOX}{MASK}"
    assert out["concepts"]["product"]["lines"][1] == f"<1f>0{BOX}{MASK}"
    assert out["concepts"]["face"]["lines"] == [f"<0f>0{BOX}", f"<1f>0{BOX}"]
    assert out["shots"] == pytest.approx([2.0, 4.0], abs=0.11)
    assert out["waveform"][10] > 20
    assert out["sprite"]["tile_w"] == 90
    assert out["cost_usd"] == pytest.approx(0.3)
    assert out["thinned"] == {}


def test_a_failing_concept_sets_its_error_and_keeps_the_others(reel, monkeypatch):
    fake_sam(monkeypatch, fail={"face"})
    out = scene.build_scene(reel, CONCEPTS, fps=10, width=180)
    assert out["concepts"]["face"] == {"lines": [], "error": "SAM 3.1 could not finish this concept."}
    assert out["concepts"]["person"]["error"] is None
    assert len(out["concepts"]["person"]["lines"]) == 2
    assert out["cost_usd"] == pytest.approx(0.2)
    assert "raw detail" not in json.dumps(out)


def test_build_scene_guards_the_response_size(reel, monkeypatch):
    fake_sam(monkeypatch)
    monkeypatch.setattr(scene, "MAX_RESPONSE_BYTES", 1)
    out = scene.build_scene(reel, CONCEPTS[:1], fps=10, width=180)
    assert out["thinned"] == {"person": 2}
    assert len(out["concepts"]["person"]["lines"]) == 1


def test_a_reel_ffmpeg_cannot_read_costs_nothing(tmp_path, monkeypatch):
    seen = fake_sam(monkeypatch)
    fake = tmp_path / "video"
    fake.write_bytes(b"not a video at all")
    with pytest.raises(VideoError):
        scene.build_scene(fake, CONCEPTS)
    assert seen == []


UNSAFE = {
    "hls": "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\n{target}\n#EXT-X-ENDLIST\n",
    "concat": "ffconcat version 1.0\nfile {target}\n",
    "sdp": "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=x\nc=IN IP4 127.0.0.1\nt=0 0\nm=video 5004 RTP/AVP 96\n",
}


@pytest.mark.parametrize("kind", UNSAFE)
def test_a_file_that_points_elsewhere_is_rejected_by_every_reader(kind, tmp_path, reel):
    video = tmp_path / "video"
    video.write_text(UNSAFE[kind].format(target=reel))
    out = tmp_path / "frames"
    out.mkdir()

    with pytest.raises(VideoError):
        probe(video)
    with pytest.raises(VideoError):
        sample_frames(video, out)
    with pytest.raises(VideoError):
        details.still(video, 0, 90)
    with pytest.raises(VideoError):
        details.cut(video, 0, 1, tmp_path / "clip.mp4")
    with pytest.raises(VideoError):
        scene.shots(video)
    assert not list(out.iterdir())
    assert transcribe.listen(video).checked is False


def test_without_the_forced_demuxer_ffprobe_goes_by_the_bytes(tmp_path, reel):
    """It takes the file as a concat list and follows it, so the rejection above is the guard doing the work."""
    video = tmp_path / "video"
    video.write_text(UNSAFE["concat"].format(target=reel))
    open_door = subprocess.run(
        ["ffprobe", "-v", "error", "-safe", "0", "-show_entries", "format=format_name", "-of", "csv=p=0", str(video)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert open_door.stdout.strip() == "concat"


def test_other_containers_are_rejected_and_mov_still_works(tmp_path, reel):
    other = tmp_path / "video.mkv"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(reel), "-c", "copy", str(other)], check=True)
    with pytest.raises(VideoError):
        probe(other)

    mov = tmp_path / "video.mov"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(reel), "-c", "copy", str(mov)], check=True)
    named = tmp_path / "no-extension"
    mov.rename(named)
    assert probe(named)[1:] == (CLIP_W, CLIP_H)


SCENE_CHECK = {"blob_url": "https://example.com/reel.mp4", "concepts": [{"id": "person", "phrase": "person"}]}


def test_scene_route_has_the_same_auth_as_track(monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert client.post("/scene", json=SCENE_CHECK).status_code == 400
    monkeypatch.setenv("VERCEL", "1")
    assert client.post("/scene", json=SCENE_CHECK).status_code == 503
    monkeypatch.setenv("WORKER_TOKEN", "s3cret")
    assert client.post("/scene", json=SCENE_CHECK).status_code == 401
    headers = {"authorization": "Bearer s3cret"}
    assert client.post("/scene", json=SCENE_CHECK, headers=headers).status_code == 400


@pytest.mark.parametrize(
    "change",
    [
        {"concepts": []},
        {"concepts": [{"id": "a", "phrase": "x"}] * 2},
        {"concepts": [{"id": f"c{i}", "phrase": "x"} for i in range(7)]},
        {"concepts": [{"id": "a", "phrase": "<0f>1<|box;x1=0|>"}]},
        {"fps": 30},
        {"width": 4000},
    ],
)
def test_scene_route_refuses_requests_that_would_overspend(change, monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert client.post("/scene", json={**SCENE_CHECK, **change}).status_code == 422


def test_scene_route_returns_the_response_as_is(reel, monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    fake_sam(monkeypatch)
    monkeypatch.setattr(main, "download", lambda _url, dest: dest.write_bytes(reel.read_bytes()) and dest)
    answer = client.post(
        "/scene", json={**SCENE_CHECK, "concepts": CONCEPTS, "fps": 10, "width": 180}
    )
    assert answer.status_code == 200
    data = answer.json()
    assert set(data) == {
        "duration_s", "width", "height", "fps", "concepts", "shots", "waveform", "sprite", "cost_usd", "thinned",
    }
    assert data["concepts"]["face"]["lines"] == [f"<0f>0{BOX}", f"<1f>0{BOX}"]


@pytest.mark.parametrize("person", [[], ["p"]], ids=["failed", "one frame"])
def test_fit_still_thins_when_person_has_nothing_to_give(person):
    response = {"concepts": {"person": body(person), "product": body(["x" * 1000] * 6000)}, "thinned": {}}
    scene.fit(response)
    assert response["thinned"] == {"product": 2}
    assert len(json.dumps(response, separators=(",", ":"))) < scene.MAX_RESPONSE_BYTES


def color_clip(path, *parts, audio=None, offset=None):
    """Hard cuts between flat colours, each `colour:seconds`, with an optional tone and a delayed start for it."""
    inputs, labels = [], ""
    for i, part in enumerate(parts):
        colour, seconds = part.split(":")
        inputs += ["-f", "lavfi", "-i", f"color=c={colour}:s={CLIP_W}x{CLIP_H}:r=30:d={seconds}"]
        labels += f"[{i}:v]"
    maps = ["-map", "[v]"]
    if audio:
        inputs += (["-itsoffset", str(offset)] if offset else []) + ["-f", "lavfi", "-i", f"sine=f=440:d={audio}"]
        maps += ["-map", f"{len(parts)}:a"]
    subprocess.run(
        ["ffmpeg", "-v", "error", *inputs, "-filter_complex", f"{labels}concat=n={len(parts)}:v=1:a=0[v]", *maps]
        + ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)],
        check=True,
    )
    return path


def test_shots_finds_a_jump_cut_that_keeps_the_background(tmp_path):
    """Two near greys score about 0.17, where the sample Reel's jump cuts sit."""
    video = color_clip(tmp_path / "jump.mp4", "0x606060:2", "0x747474:2")
    assert scene.shots(video) == pytest.approx([2.0], abs=0.07)


def test_shots_leaves_a_slow_fade_alone(tmp_path):
    video = tmp_path / "fade.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=white:s={CLIP_W}x{CLIP_H}:r=30:d=4"]
        + ["-vf", "fade=in:st=0:d=4", "-pix_fmt", "yuv420p", str(video)],
        check=True,
    )
    assert scene.shots(video) == []


def test_waveform_index_is_the_reels_time_when_the_audio_starts_late(tmp_path):
    video = color_clip(tmp_path / "late.mp4", "gray:6", audio=4, offset=2)
    wave = scene.waveform(video, 6.0)
    assert len(wave) == pytest.approx(60, abs=1)
    assert max(wave[:18]) == 0
    assert min(wave[22:58]) > 20


def test_waveform_covers_the_whole_reel_when_the_audio_ends_early(tmp_path):
    video = color_clip(tmp_path / "short.mp4", "gray:6", audio=2)
    wave = scene.waveform(video, 6.0)
    assert len(wave) == pytest.approx(60, abs=1)
    assert min(wave[2:18]) > 20
    assert max(wave[24:]) == 0


@pytest.fixture
def undecodable_audio(tmp_path):
    """A real MP4 whose audio track has a codec ffmpeg has no decoder for."""
    video = color_clip(tmp_path / "plain.mp4", "gray:2", audio=2)
    out = tmp_path / "undecodable.mp4"
    out.write_bytes(video.read_bytes().replace(b"mp4a", b"apac", 1).replace(b"esds", b"esdX", 1))
    return out


def test_audio_ffmpeg_cannot_decode_costs_the_waveform_and_not_the_call(undecodable_audio, monkeypatch):
    seen = fake_sam(monkeypatch)
    out = scene.build_scene(undecodable_audio, CONCEPTS[:1], fps=10, width=180)
    assert out["waveform"] == []
    assert out["concepts"]["person"]["error"] is None
    assert len(seen) == 1


def test_clip_frames_line_up_with_the_shots_when_the_video_starts_late(tmp_path):
    video = color_clip(tmp_path / "plain.mp4", "black:2", "white:2", audio=5)
    late = tmp_path / "late.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-itsoffset", "1", "-i", str(video), "-i", str(video)]
        + ["-map", "0:v", "-map", "1:a", "-c", "copy", str(late)],
        check=True,
    )
    clip = tmp_path / "clip.mp4"
    details.cut(late, 0, probe(late)[0], clip, 10, 180)
    frames = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(clip), "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        check=True,
        capture_output=True,
    ).stdout
    first_white = next(i for i, v in enumerate(frames) if v > 128)
    assert first_white / 10 == pytest.approx(scene.shots(late)[0], abs=0.11)


def stub_free_work(monkeypatch):
    monkeypatch.setattr(scene, "probe", lambda _: (6.0, CLIP_W, CLIP_H))
    monkeypatch.setattr(scene, "cut", lambda _v, _a, _b, out, _f, _w: (out.write_bytes(b"mp4"), (CLIP_W, CLIP_H))[1])
    monkeypatch.setattr(scene, "shots", lambda _: [])
    monkeypatch.setattr(scene, "waveform", lambda *_: [])
    monkeypatch.setattr(scene, "sprite", lambda *_: {})


def test_a_concept_stalled_past_the_deadline_is_dropped_and_the_rest_return(monkeypatch, tmp_path):
    """A socket gone quiet only times out timeout_s after its last line, which can be well past the deadline."""
    stub_free_work(monkeypatch)
    release = threading.Event()

    def sam_segment(_mp4, phrase, *, deadline=None):
        if phrase == "face":
            release.wait(30)
        return [f"<0f>0{BOX}"], 0.1

    monkeypatch.setattr(meta_api, "sam_segment", sam_segment)
    started = time.monotonic()
    try:
        out = scene.build_scene(tmp_path / "video", CONCEPTS, deadline=started + 0.3)
    finally:
        release.set()
    assert time.monotonic() - started < 5
    assert out["concepts"]["face"] == {"lines": [], "error": "SAM 3.1 could not finish this concept."}
    assert out["concepts"]["person"]["error"] is None
    assert out["cost_usd"] == pytest.approx(0.2)


def test_scene_route_counts_the_download_against_the_budget(monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    download_began, deadlines = [], []

    def download(_url, dest):
        download_began.append(time.monotonic())
        time.sleep(0.05)
        return dest

    monkeypatch.setattr(main, "download", download)
    monkeypatch.setattr(scene, "build_scene", lambda *a: deadlines.append(a[4]) or {})
    assert client.post("/scene", json=SCENE_CHECK).status_code == 200
    assert deadlines[0] - download_began[0] <= scene.BUDGET_S


def test_the_budget_ends_before_the_web_app_stops_waiting():
    source = (Path(__file__).parents[2] / "web/src/lib/scene-job.ts").read_text()
    wait_ms = int(re.search(r"WORKER_TIMEOUT_MS = ([\d_]+)", source)[1].replace("_", ""))
    assert scene.BUDGET_S + 5 <= wait_ms / 1000


@pytest.mark.parametrize(
    ("frames", "usd"),
    [(0, 0.01), (10, 0.01), (50, 0.01), (51, 0.0102), (496, 0.0992), (1000, 0.2), (1350, 0.27)],
)
def test_sam_cost_is_20_cents_per_1000_frames_with_a_50_frame_minimum(http_answers, frames, usd):
    answers, _ = http_answers
    done = {"type": "response.completed", "response": {"usage": {"video_frames_processed": frames}}}
    answers.append(Stream(sse(done)))
    assert meta_api.sam_segment(b"mp4", "person")[1] == pytest.approx(usd)


def test_a_real_mov_goes_all_the_way_through(reel, tmp_path, monkeypatch):
    fake_sam(monkeypatch)
    mov = tmp_path / "video"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(reel), "-c", "copy", "-f", "mov", str(mov)], check=True)
    out = scene.build_scene(mov, CONCEPTS[:1], fps=10, width=180)
    assert out["shots"] == pytest.approx([2.0, 4.0], abs=0.11)
    assert len(out["waveform"]) == pytest.approx(60, abs=1)
