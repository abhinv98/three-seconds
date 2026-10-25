"""Frame sampling.

The real stage downloads the video and samples it at 5 fps with ffmpeg, roughly:

    ffmpeg -i input.mp4 -vf fps=5 -q:v 3 frames/%05d.jpg

Stub: no download and no ffmpeg call; it only returns the timestamps the real stage would produce.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

SAMPLE_FPS = 5.0


@dataclass(frozen=True)
class Frame:
    t: float
    """Seconds from the start of the video."""
    path: Path | None
    """Extracted JPEG, or None while frames are stubbed."""


def sample_frames(video_url: str, duration_s: float, fps: float = SAMPLE_FPS) -> list[Frame]:
    """Sample frames from the video at `fps`.

    Args:
        video_url: Public Blob URL of the uploaded video.
        duration_s: Video length in seconds.
        fps: Sampling rate; the report contract records it as video.fps_sampled.

    Returns:
        One Frame per sample, in time order. Stubbed frames have no image path.
    """
    count = int(duration_s * fps) + 1
    return [Frame(t=round(i / fps, 3), path=None) for i in range(count) if i / fps <= duration_s]
