"""POST /scene: what the Studio draws on and under the Reel.

The whole Reel is cut once to H.264, and each text concept goes through SAM 3.1 in parallel on those same bytes. The
frame lines come back raw, because the web app decodes masks (the Python parser is about 50 times slower). Hard cuts,
the waveform and the filmstrip come from ffmpeg first: they're free, so a Reel it can't read costs nothing.
"""

from __future__ import annotations

import json
import logging
import math
import re
import tempfile
import time
from array import array
from concurrent.futures import ThreadPoolExecutor, wait
from pathlib import Path

import meta_api
from pipeline.details import b64, cut, run_ffmpeg
from pipeline.frames import SAFE_INPUT, VideoError, probe
from pipeline.transcribe import has_audio_track

SCENE_THRESHOLD = 0.15
"""Jump cuts that keep the background score about 0.17 on the sample Reel; a slow fade stays well under."""
MIN_SHOT_S = 0.2
WAVE_RATE = 8000
WAVE_STEP_S = 0.1
TILE_W = 90
TILE_COLS = 20
MAX_TILES = 120
MIN_EVERY_S = 0.25
MAX_SPRITE_BYTES = 400_000
MAX_RESPONSE_BYTES = 4_000_000
"""Vercel refuses a response over 4.5 MB."""
BUDGET_S = 240.0
"""SAM gives up here, so the concepts that finished get back before the web app stops waiting (scene-job.ts)."""
THIN_FIRST = "person"
"""The biggest by far, and the Studio only reads every second frame of it."""

log = logging.getLogger(__name__)


def shots(video: Path) -> list[float]:
    """Seconds of each hard cut. Read from the original: on the cut clip, two of the sample Reel's nine fall short.

    A flash between two shots scores twice, a frame apart, and counts once.
    """
    printed = run_ffmpeg(
        [*SAFE_INPUT, "-i", str(video), "-an", "-vf", f"select='gt(scene,{SCENE_THRESHOLD})',metadata=print:file=-"]
        + ["-f", "null", "-"]
    )
    cuts: list[float] = []
    for t in re.findall(r"pts_time:([\d.]+)", printed.decode()):
        if not cuts or float(t) - cuts[-1] >= MIN_SHOT_S:
            cuts.append(round(float(t), 3))
    return cuts


def waveform(video: Path, duration: float) -> list[int]:
    """Peak per WAVE_STEP_S as 0..255 of full scale, index by the Reel's own time however late the audio starts or
    however early it ends. Empty when there's no audio track or ffmpeg can't decode it: that costs the waveform only.
    """
    if not has_audio_track(video):
        return []
    try:
        pcm = run_ffmpeg(
            [*SAFE_INPUT, "-i", str(video), "-vn", "-ac", "1", "-ar", str(WAVE_RATE)]
            + ["-af", "aresample=async=1:first_pts=0,apad", "-t", f"{duration:.3f}", "-f", "s16le", "-"]
        )
    except VideoError as e:
        log.warning("no waveform: %s", e)
        return []
    samples = array("h", pcm[: len(pcm) // 2 * 2])
    step = round(WAVE_RATE * WAVE_STEP_S)
    return [max(map(abs, samples[i : i + step])) * 255 // 32768 for i in range(0, len(samples), step)]


def sprite(clip: Path, duration: float, width: int, height: int) -> dict:
    """A contact sheet, one TILE_W tile per every_s. Tile i shows the Reel at i * every_s.

    every_s starts as short as MAX_TILES allows and grows until the JPEG fits, which a Reel with busy frames needs.
    """
    tile_h = max(2, round(height * TILE_W / width / 2) * 2)
    every_s = max(MIN_EVERY_S, round(duration / MAX_TILES, 3))
    while True:
        tiles = max(1, math.ceil(duration / every_s))
        cols = min(tiles, TILE_COLS)
        rows = math.ceil(tiles / cols)
        jpeg = run_ffmpeg(
            [*SAFE_INPUT, "-i", str(clip), "-an", "-frames:v", "1"]
            + ["-vf", f"fps={1 / every_s:.6f}:round=up,scale={TILE_W}:{tile_h},tile={cols}x{rows}"]
            + ["-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
        )
        if len(jpeg) < MAX_SPRITE_BYTES or tiles == 1:
            return {"jpeg": b64(jpeg), "cols": cols, "rows": rows, "tile_w": TILE_W, "tile_h": tile_h, "every_s": every_s}
        every_s = round(every_s * 1.25, 3)


def _size(response: dict) -> int:
    return len(json.dumps(response, separators=(",", ":")))


def fit(response: dict) -> dict:
    """Drop every other frame until the response fits, and say so in `thinned` as {concept id: keep 1 in n}.

    THIN_FIRST goes first; after that whichever concept is biggest, which is usually still that one.
    """
    concepts, thinned = response["concepts"], response["thinned"]
    while _size(response) > MAX_RESPONSE_BYTES:
        if len(concepts.get(THIN_FIRST, {"lines": []})["lines"]) >= 2 and THIN_FIRST not in thinned:
            target = THIN_FIRST
        else:
            target = max(concepts, key=lambda c: sum(map(len, concepts[c]["lines"])))
        lines = concepts[target]["lines"]
        if len(lines) < 2:
            break
        concepts[target]["lines"] = lines[::2]
        thinned[target] = thinned.get(target, 1) * 2
    return response


def build_scene(
    video: Path, concepts: list[dict], fps: int = 15, width: int = 540, deadline: float | None = None
) -> dict:
    """The /scene response for a local video. A concept SAM can't finish by `deadline` (time.monotonic()) sets its own
    error; the rest still return.
    """
    started = time.monotonic()
    deadline = deadline if deadline is not None else started + BUDGET_S
    duration, _, _ = probe(video)
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp, "clip.mp4")
        clip_w, clip_h = cut(video, 0.0, duration, clip, fps, width)
        cut_s = time.monotonic() - started
        cuts, wave, sheet = shots(video), waveform(video, duration), sprite(clip, duration, clip_w, clip_h)
        mp4 = clip.read_bytes()
    free_s = time.monotonic() - started

    unfinished = {"lines": [], "error": "SAM 3.1 could not finish this concept."}

    def run(concept: dict) -> tuple[dict, float]:
        try:
            lines, cost = meta_api.sam_segment(mp4, concept["phrase"], deadline=deadline)
        except Exception as e:  # The other concepts are already paid for: one failure can't lose them.
            log.warning("SAM 3.1 could not finish %s: %s", concept["id"], e)
            return dict(unfinished), 0.0
        return {"lines": lines if concept["masks"] else [meta_api.strip_masks(x) for x in lines], "error": None}, cost

    # Not a `with` block: leaving one waits for every thread, and a socket gone quiet can outlast the deadline.
    pool = ThreadPoolExecutor(len(concepts))
    futures = [pool.submit(run, c) for c in concepts]
    wait(futures, timeout=max(0.0, deadline - time.monotonic()))
    pool.shutdown(wait=False, cancel_futures=True)
    results = [f.result() if f.done() and not f.cancelled() else (dict(unfinished), 0.0) for f in futures]
    response = fit(
        {
            "duration_s": round(duration, 3),
            "width": clip_w,
            "height": clip_h,
            "fps": fps,
            "concepts": {c["id"]: result for c, (result, _) in zip(concepts, results, strict=True)},
            "shots": cuts,
            "waveform": wave,
            "sprite": sheet,
            "cost_usd": round(sum(cost for _, cost in results), 4),
            "thinned": {},
        }
    )
    log.info(
        "scene: %.1fs Reel, clip %.1f MB; cut %.1fs, ffmpeg extras %.1fs, SAM %.1fs; %d bytes back, $%.4f",
        duration,
        len(mp4) / 1e6,
        cut_s,
        free_s - cut_s,
        time.monotonic() - started - free_s,
        _size(response),
        response["cost_usd"],
    )
    return response
