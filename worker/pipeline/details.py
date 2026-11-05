"""Video work for the finer-details pass (the web app's lib/finer.ts runs the pass itself).

/frames: stills at 1 fps for the model that finds what to change, plus a poster frame.
/track: SAM 3.1 follows each thing the model pointed at, through a short clip around it, and returns where it
was frame by frame as keyframed boxes (fractions of the frame). It also returns a still per change, for the list.

Each object gets its own clip, cut to its stretch of the Reel (plus a quarter second either side, at most 12 s)
at 15 fps and 540 px wide: SAM bills per frame, so a 4 s stretch costs 60 frames ($0.012) instead of the whole Reel.
"""

from __future__ import annotations

import base64
import logging
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import meta_api
from pipeline.frames import SAFE_INPUT, VideoError, sample_frames

TRACK_FPS = 15
TRACK_WIDTH = 540
MAX_TRACK_S = 12.0
PAD_S = 0.25
KEYFRAME_STEP = 3
"""Every third tracked frame (5 a second) is kept; the player moves the box linearly between them."""
MAX_GAP_FRAMES = 2
"""Frames missing between two tracked ones before the track counts as two stretches."""
PARALLEL_TRACKS = 4

log = logging.getLogger(__name__)


def run_ffmpeg(args: list[str]) -> bytes:
    try:
        result = subprocess.run(["ffmpeg", "-v", "error", *args], check=False, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired as e:
        raise VideoError("ffmpeg took too long on this video") from e
    if result.returncode != 0:
        raise VideoError(f"ffmpeg failed: {result.stderr.decode(errors='replace').strip()[:200]}")
    return result.stdout


def still(video: Path, t: float, width: int) -> bytes:
    """One JPEG frame at t seconds, `width` px wide."""
    return run_ffmpeg(
        ["-ss", f"{max(t, 0):.3f}", *SAFE_INPUT, "-i", str(video), "-frames:v", "1", "-vf", f"scale={width}:-2"]
        + ["-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    )


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


FRAME_QUALITY = 6
"""JPEG -q:v for the model's frames: a 90 s Reel at 1 fps stays near 2 MB, well under Vercel's 4.5 MB response cap."""


def frame_payload(video: Path, out_dir: Path, fps: float, width: int) -> list[dict]:
    """Stills at `fps`, at most `width` px wide, as {t, jpeg (base64)}."""
    frames = sample_frames(video, out_dir, fps, max_width=width, quality=FRAME_QUALITY)
    return [{"t": f.t, "jpeg": b64(f.path.read_bytes())} for f in frames]


def window(t: float, t_start: float, t_end: float, duration: float) -> tuple[float, float]:
    """The clip to track in: the stretch plus PAD_S either side, at most MAX_TRACK_S, always containing t."""
    a, b = max(0.0, min(t_start, t) - PAD_S), min(duration, max(t_end, t) + PAD_S)
    if b - a > MAX_TRACK_S:
        a = max(0.0, min(t - MAX_TRACK_S / 2, duration - MAX_TRACK_S))
        b = min(duration, a + MAX_TRACK_S)
    return round(a, 3), round(b, 3)


def cut(
    video: Path, a: float, b: float, out: Path, fps: int = TRACK_FPS, width: int = TRACK_WIDTH
) -> tuple[int, int]:
    """Re-encode [a, b] at fps and width as H.264 with no audio; returns the clip's width and height."""
    run_ffmpeg(
        ["-y", "-ss", f"{a:.3f}", *SAFE_INPUT, "-i", str(video), "-t", f"{b - a:.3f}", "-an"]
        + ["-vf", f"fps={fps}:start_time=0,scale={width}:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26"]
        + ["-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
    )
    size = subprocess.run(
        ["ffprobe", "-v", "error", *SAFE_INPUT, "-select_streams", "v:0", "-show_entries", "stream=width,height"]
        + ["-of", "csv=p=0", "-i", str(out)],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    width, height = (int(v) for v in size.split(",")[:2])
    return width, height


def box_prompt(box: list[float], frame: int, width: int, height: int) -> str:
    """A SAM 3.1 box prompt for a box given as fractions [x, y, w, h] of the frame."""
    x, y, w, h = (min(max(v, 0.0), 1.0) for v in box)
    x1, y1 = round(x * width), round(y * height)
    x2 = max(x1, min(width - 1, round((x + w) * width) - 1))
    y2 = max(y1, min(height - 1, round((y + h) * height) - 1))
    return f"<{frame}f>1<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={width};h={height}|>"


def spans_from_boxes(boxes: list[meta_api.SamBox], start_s: float) -> list[dict]:
    """Tracked boxes as stretches of time, each with keyframes {t, box: [x, y, w, h] as fractions}."""
    by_frame: dict[int, meta_api.SamBox] = {}
    for box in sorted(boxes, key=lambda b: (b.frame, -(b.confidence or 0))):
        by_frame.setdefault(box.frame, box)
    frames = sorted(by_frame)
    groups: list[list[int]] = []
    for f in frames:
        if groups and f - groups[-1][-1] <= MAX_GAP_FRAMES + 1:
            groups[-1].append(f)
        else:
            groups.append([f])

    def keyframe(f: int) -> dict:
        b = by_frame[f]
        return {
            "t": round(start_s + f / TRACK_FPS, 3),
            "box": [
                round(b.x1 / b.width, 4),
                round(b.y1 / b.height, 4),
                round((b.x2 - b.x1 + 1) / b.width, 4),
                round((b.y2 - b.y1 + 1) / b.height, 4),
            ],
        }

    spans = []
    for group in groups:
        keep = group[::KEYFRAME_STEP]
        if keep[-1] != group[-1]:
            keep.append(group[-1])
        spans.append(
            {
                "t_start": round(start_s + group[0] / TRACK_FPS, 3),
                "t_end": round(start_s + (group[-1] + 1) / TRACK_FPS, 3),
                "boxes": [keyframe(f) for f in keep],
            }
        )
    return spans


def track_one(video: Path, duration: float, obj: dict) -> tuple[list[dict], float]:
    """SAM 3.1 on one object: its spans (empty if SAM found nothing) and the cost."""
    a, b = window(obj["t"], obj["t_start"], obj["t_end"], duration)
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp, "clip.mp4")
        width, height = cut(video, a, b, clip)
        last = max(0, round((b - a) * TRACK_FPS) - 1)
        frame = min(last, max(0, round((min(max(obj["t"], a), b) - a) * TRACK_FPS)))
        boxes, cost = meta_api.sam_track(clip.read_bytes(), box_prompt(obj["box"], frame, width, height))
    return spans_from_boxes(boxes, a), cost


def track_and_stills(video: Path, duration: float, objects: list[dict], stills: list[float]) -> dict:
    """Every object tracked in parallel; an object SAM can't track is listed in `failed` and left to the caller."""
    tracks: dict[str, list[dict]] = {}
    failed: list[str] = []
    cost = 0.0

    def run(obj: dict) -> tuple[str, list[dict] | None, float]:
        try:
            spans, c = track_one(video, duration, obj)
            return obj["id"], spans, c
        except (meta_api.MetaAPIError, VideoError, subprocess.SubprocessError, ValueError) as e:
            log.warning("SAM 3.1 could not track %s: %s", obj["id"], e)
            return obj["id"], None, 0.0

    with ThreadPoolExecutor(PARALLEL_TRACKS) as pool:
        for oid, spans, c in pool.map(run, objects):
            cost += c
            if spans:
                tracks[oid] = spans
            else:
                failed.append(oid)
    log.info("finer details: %d of %d objects tracked, $%.4f", len(tracks), len(objects), cost)
    return {
        "tracks": tracks,
        "failed": failed,
        "stills": [{"t": t, "jpeg": b64(still(video, min(t, max(duration - 0.05, 0)), 120))} for t in stills],
        "cost_usd": round(cost, 4),
        "model": meta_api.SAM_MODEL,
    }
