"""Assembles the report from the pipeline stages: frames -> vision -> track -> rules.

If the label's hold is within one 2 fps interval of what ASCI requires, its edges are re-sampled at
10 fps and read again before the checks run. The audio stage isn't wired yet: audio_checked is false,
the transcript is empty and spoken_disclosure says so.
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import llm
from models import AnalyzeRequest, Report
from pipeline.asci import required_hold
from pipeline.frames import EDGE_FPS, SAMPLE_FPS, download, probe, sample_frames
from pipeline.rules import evaluate_rules, overall_verdict
from pipeline.track import edge_windows, label_track, merge_readings
from pipeline.vision import FrameReading, read_frames

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Analysis:
    report: Report
    readings: list[FrameReading]
    """2 fps readings, with the 10 fps edge readings merged in."""
    replies: list[llm.Reply]
    """The 2 fps pass."""
    edge_readings: list[FrameReading] = field(default_factory=list)
    edge_replies: list[llm.Reply] = field(default_factory=list)


def cost(replies: list[llm.Reply]) -> float | None:
    """Total list-price cost, or None if any reply's price is unknown."""
    costs = [r.cost_usd for r in replies]
    return None if None in costs else sum(c for c in costs if c is not None)


def analyze_video(video: Path, filename: str, blob_url: str) -> Analysis:
    """Run the pipeline on a local video file."""
    duration, width, height = probe(video)
    edge_readings: list[FrameReading] = []
    edge_replies: list[llm.Reply] = []
    with tempfile.TemporaryDirectory() as tmp:
        coarse_dir, edge_dir = Path(tmp, "2fps"), Path(tmp, "edges")
        coarse_dir.mkdir()
        edge_dir.mkdir()
        readings, replies = read_frames(sample_frames(video, coarse_dir, SAMPLE_FPS))
        windows = edge_windows(readings, required_hold(duration)[0], SAMPLE_FPS, duration)
        if windows:
            edge_readings, edge_replies = read_frames(sample_frames(video, edge_dir, EDGE_FPS, windows))
            readings = merge_readings(readings, edge_readings)
            log.info(
                "%s: hold within margin, %d extra frames at %g fps in %s, %d requests, $%s",
                filename,
                len(edge_readings),
                EDGE_FPS,
                ", ".join(f"{a:.1f}-{b:.1f}s" for a, b in windows),
                len(edge_replies),
                _dollars(cost(edge_replies)),
            )
    track = label_track(readings, SAMPLE_FPS, duration)
    checks = evaluate_rules(readings, track, SAMPLE_FPS, duration, edge_readings)
    log.info(
        "%s: %.1fs, %d frames, %d requests, $%s",
        filename,
        duration,
        len(readings),
        len(replies) + len(edge_replies),
        _dollars(cost(replies + edge_replies)),
    )
    report = Report.model_validate(
        {
            "job_id": str(uuid.uuid4()),
            "status": "done",
            "mock": False,
            "video": {
                "filename": filename,
                "blob_url": blob_url,
                "duration_s": round(duration, 2),
                "width": width,
                "height": height,
                "fps_sampled": SAMPLE_FPS,
            },
            "verdict": overall_verdict(checks),
            "checks": [c.model_dump() for c in checks],
            "tracks": [track.model_dump()],
            "transcript": [],
            "audio_checked": False,
            "models_used": [llm.provider().model],
            "generated_at": datetime.now(UTC),
        }
    )
    return Analysis(report, readings, replies, edge_readings, edge_replies)


def _dollars(amount: float | None) -> str:
    return "?" if amount is None else f"{amount:.4f}"


def build_report(request: AnalyzeRequest) -> Report:
    """Download the uploaded video and run the pipeline on it."""
    with tempfile.TemporaryDirectory() as tmp:
        video = download(request.blob_url, Path(tmp) / "video")
        return analyze_video(video, request.filename, request.blob_url).report
