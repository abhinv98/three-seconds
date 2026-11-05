"""Video download, probing and frame sampling.

Frames are sampled at 2 fps and scaled to at most 720 px wide with ffmpeg:

    ffmpeg -i input.mp4 -vf "fps=2:round=up,scale='min(720,iw)':-2" -q:v 3 frames/%05d.jpg

Frame i of the output is the video at i / fps seconds. round=up matters: the fps filter fills each output
slot with the last source frame that rounds into it, so the default round=near shows up to half an
interval (0.23s at 30 fps) after the slot's timestamp.

When a label's hold lands within one 2 fps interval of what ASCI requires, its edges are re-sampled
at 10 fps (EDGE_FPS) inside short windows: the same filter, plus select='eq(n,k)+...' keeping only
the slots k inside the windows.
"""

from __future__ import annotations

import http.client
import json
import math
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

SAMPLE_FPS = 2.0
EDGE_FPS = 10.0
MAX_WIDTH = 720
MAX_BYTES = 100 * 1024 * 1024
"""Same limits as web/src/lib/limits.ts; the worker enforces them again because its URL is public."""
MAX_DURATION_S = 90.0
BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"
SAFE_INPUT = ["-protocol_whitelist", "file,pipe", "-f", "mov"]
"""Goes before every -i of an uploaded file. Left to itself ffmpeg picks a demuxer from the bytes, and an HLS playlist
or a concat list then makes it fetch URLs or read local files. Forced to the MP4/MOV demuxer those are just unreadable."""


class VideoError(ValueError):
    """The video can't be fetched or read; the caller answers HTTP 400."""


@dataclass(frozen=True)
class Frame:
    t: float
    """Seconds from the start of the video."""
    path: Path
    """Extracted JPEG."""


def download(url: str, dest: Path) -> Path:
    """Download a Vercel Blob video to dest.

    Only https URLs on the public Blob host are fetched, so the worker can't be pointed at internal
    addresses, and the body is capped at MAX_BYTES.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(BLOB_HOST_SUFFIX):
        raise VideoError(f"blob_url must be an https URL on *{BLOB_HOST_SUFFIX}")
    try:
        with urllib.request.urlopen(url, timeout=30) as response, dest.open("wb") as out:
            size = 0
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise VideoError(f"Video is larger than {MAX_BYTES // (1024 * 1024)} MB")
                out.write(chunk)
    except (OSError, http.client.HTTPException) as e:
        raise VideoError(f"Could not download the video: {e}") from e
    return dest


def probe(video: Path) -> tuple[float, int, int]:
    """Duration in seconds, width and height of the first video stream."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", *SAFE_INPUT, "-select_streams", "v:0"]
        + ["-show_entries", "format=duration:stream=width,height", "-of", "json", "-i", str(video)],
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        info = json.loads(result.stdout)
        stream = info["streams"][0]
        duration = float(info["format"]["duration"])
    except (ValueError, KeyError, IndexError) as e:
        raise VideoError(f"Not a readable MP4 or MOV video: {result.stderr.strip()[:200]}") from e
    if duration > MAX_DURATION_S + 0.5:
        raise VideoError(f"Video is {duration:.0f}s long; the limit is {MAX_DURATION_S:.0f}s")
    return duration, int(stream["width"]), int(stream["height"])


def sample_frames(
    video: Path,
    out_dir: Path,
    fps: float = SAMPLE_FPS,
    windows: list[tuple[float, float]] | None = None,
    max_width: int = MAX_WIDTH,
    quality: int = 3,
) -> list[Frame]:
    """Sample frames from the video at `fps`, at most MAX_WIDTH wide.

    Args:
        video: Local video file.
        out_dir: Empty directory for the JPEGs.
        fps: Sampling rate; the report contract records it as video.fps_sampled.
        windows: (start, end) seconds. If given, only the slots inside them (ends included) are kept.
        max_width: Frames wider than this are scaled down to it.
        quality: ffmpeg's JPEG -q:v, 2 (best) to 31.

    Returns:
        One Frame per sample, in time order.
    """
    vf = f"fps={fps}:round=up"
    slots: list[int] | None = None
    if windows:
        slots = sorted(
            {k for a, b in windows for k in range(max(0, math.ceil(a * fps - 1e-6)), math.floor(b * fps + 1e-6) + 1)}
        )
        vf += ",select='" + "+".join(f"eq(n,{k})" for k in slots) + "'"
    result = subprocess.run(
        ["ffmpeg", "-v", "error", *SAFE_INPUT, "-i", str(video), "-vf", f"{vf},scale='min({max_width},iw)':-2"]
        + ["-fps_mode", "passthrough", "-q:v", str(quality), str(out_dir / "%05d.jpg")],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise VideoError(f"ffmpeg could not read the video: {result.stderr.strip()[:200]}")
    paths = sorted(out_dir.glob("*.jpg"))
    # Slots past the end of the video produce no file; zip drops them.
    times = [k / fps for k in slots] if slots is not None else [i / fps for i in range(len(paths))]
    return [Frame(t=round(t, 3), path=p) for t, p in zip(times, paths, strict=False)]
