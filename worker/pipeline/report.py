"""Assembles the report from the pipeline stages: frames -> vision -> track -> rules.

The audio stage isn't wired yet, so the transcript is empty and spoken_disclosure is REVIEW.
"""

from __future__ import annotations

import tempfile
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import llm
from models import AnalyzeRequest, Report
from pipeline.frames import SAMPLE_FPS, download, probe, sample_frames
from pipeline.rules import evaluate_rules, overall_verdict
from pipeline.track import label_track
from pipeline.vision import FrameReading, read_frames


@dataclass(frozen=True)
class Analysis:
    report: Report
    readings: list[FrameReading]
    replies: list[llm.Reply]


def analyze_video(video: Path, filename: str, blob_url: str) -> Analysis:
    """Run the pipeline on a local video file."""
    duration, width, height = probe(video)
    with tempfile.TemporaryDirectory() as frames_dir:
        frames = sample_frames(video, Path(frames_dir), SAMPLE_FPS)
        readings, replies = read_frames(frames)
    track = label_track(readings, SAMPLE_FPS, duration)
    checks = evaluate_rules(readings, track, SAMPLE_FPS, duration)
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
            "models_used": [llm.provider().model],
            "generated_at": datetime.now(UTC),
        }
    )
    return Analysis(report, readings, replies)


def build_report(request: AnalyzeRequest) -> Report:
    """Download the uploaded video and run the pipeline on it."""
    with tempfile.TemporaryDirectory() as tmp:
        video = download(request.blob_url, Path(tmp) / "video")
        return analyze_video(video, request.filename, request.blob_url).report
