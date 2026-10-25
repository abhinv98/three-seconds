"""On-screen tracking with SAM 3.1.

The real stage prompts SAM 3.1 with text ("paid partnership label", the brand name) on the sampled
frames, then merges per-frame masks into time spans with first/last seen, total time on screen and
the largest share of the frame covered.

Stub: returns the fixture's tracks. No model is called.
"""

from __future__ import annotations

from models import Track
from pipeline.fixture import load_fixture
from pipeline.frames import Frame


def track_objects(frames: list[Frame], prompts: list[str]) -> list[Track]:
    """Track each prompted object across the frames.

    Args:
        frames: Output of frames.sample_frames.
        prompts: Text prompts, one per object to track.

    Returns:
        One Track per prompt (disclosure label first, then brand).
    """
    return [Track.model_validate(t) for t in load_fixture()["tracks"]]
