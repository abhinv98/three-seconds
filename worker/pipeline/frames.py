"""Video download, probing and frame sampling.

Frames are sampled at 2 fps and scaled to at most 720 px wide with ffmpeg:

    ffmpeg -i input.mp4 -vf "fps=2,scale='min(720,iw)':-2" -q:v 3 frames/%05d.jpg

Frame i of the output is the video at i / fps seconds.
"""

from __future__ import annotations

import json
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

SAMPLE_FPS = 2.0
MAX_WIDTH = 720
MAX_BYTES = 100 * 1024 * 1024
"""Same limits as web/src/lib/limits.ts; the worker enforces them again because its URL is public."""
MAX_DURATION_S = 90.0
BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"


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
    except OSError as e:
        raise VideoError(f"Could not download the video: {e}") from e
    return dest


def probe(video: Path) -> tuple[float, int, int]:
    """Duration in seconds, width and height of the first video stream."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height"]
        + ["-of", "json", str(video)],
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        info = json.loads(result.stdout)
        stream = info["streams"][0]
        duration = float(info["format"]["duration"])
    except (ValueError, KeyError, IndexError) as e:
        raise VideoError(f"Not a readable video: {result.stderr.strip()[:200]}") from e
    if duration > MAX_DURATION_S + 0.5:
        raise VideoError(f"Video is {duration:.0f}s long; the limit is {MAX_DURATION_S:.0f}s")
    return duration, int(stream["width"]), int(stream["height"])


def sample_frames(video: Path, out_dir: Path, fps: float = SAMPLE_FPS) -> list[Frame]:
    """Sample frames from the video at `fps`, at most MAX_WIDTH wide.

    Args:
        video: Local video file.
        out_dir: Empty directory for the JPEGs.
        fps: Sampling rate; the report contract records it as video.fps_sampled.

    Returns:
        One Frame per sample, in time order.
    """
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={fps},scale='min({MAX_WIDTH},iw)':-2"]
        + ["-q:v", "3", str(out_dir / "%05d.jpg")],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise VideoError(f"ffmpeg could not read the video: {result.stderr.strip()[:200]}")
    return [Frame(t=round(i / fps, 3), path=p) for i, p in enumerate(sorted(out_dir.glob("*.jpg")))]
