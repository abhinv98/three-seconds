"""Assembles the report from the pipeline stages.

While the stages are stubbed, the report is the shared fixture with the real file swapped in and
every time scaled to the real duration (the same rules as web/src/lib/mock.ts).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from models import AnalyzeRequest, Report
from pipeline.fixture import load_fixture
from pipeline.frames import SAMPLE_FPS, sample_frames
from pipeline.rules import evaluate_rules, overall_verdict
from pipeline.track import track_objects
from pipeline.transcribe import transcribe

MODELS_USED = ["mock-fixture"]

_TIMECODE = re.compile(r"\b(\d{2}):(\d{2}\.\d)\b")
_SECONDS = re.compile(r"\b(\d+(?:\.\d+)?)s\b")


def _timecode(seconds: float) -> str:
    tenths = round(max(0.0, seconds) * 10)
    minutes, rest = divmod(tenths, 600)
    return f"{minutes:02d}:{rest / 10:04.1f}"


def scale_times_in_text(text: str, k: float) -> str:
    """Rescale every "1.8s" and "00:03.0" in a sentence by k."""
    if k == 1:
        return text
    text = _TIMECODE.sub(lambda m: _timecode((int(m[1]) * 60 + float(m[2])) * k), text)
    return _SECONDS.sub(lambda m: f"{round(float(m[1]) * k, 1):.1f}s", text)


def build_report(request: AnalyzeRequest) -> Report:
    """Run the (stubbed) pipeline and return a report that matches shared/report.schema.json."""
    data = load_fixture()
    duration = request.duration_s or data["video"]["duration_s"]
    k = duration / data["video"]["duration_s"]

    def t(x: float) -> float:
        return min(duration, round(x * k, 1))

    frames = sample_frames(request.blob_url, duration, SAMPLE_FPS)
    tracks = track_objects(frames, prompts=["paid partnership label", "brand logo"])
    transcript = transcribe(request.blob_url)
    checks = evaluate_rules(tracks, transcript, duration)

    for track in tracks:
        for span in track.spans:
            span.t_start, span.t_end = t(span.t_start), t(span.t_end)
        track.first_seen_s = None if track.first_seen_s is None else t(track.first_seen_s)
        track.last_seen_s = None if track.last_seen_s is None else t(track.last_seen_s)
        track.total_on_screen_s = round(track.total_on_screen_s * k, 1)
    for segment in transcript:
        segment.t_start, segment.t_end = t(segment.t_start), t(segment.t_end)
    for check in checks:
        check.detail = scale_times_in_text(check.detail, k)
        for evidence in check.evidence:
            evidence.t_start, evidence.t_end = t(evidence.t_start), t(evidence.t_end)
            evidence.note = scale_times_in_text(evidence.note, k)
        if check.fix:
            check.fix.steps = [scale_times_in_text(s, k) for s in check.fix.steps]

    video = {
        **data["video"],
        "filename": request.filename,
        "blob_url": request.blob_url,
        "duration_s": duration,
        "width": request.width or data["video"]["width"],
        "height": request.height or data["video"]["height"],
        "fps_sampled": SAMPLE_FPS,
    }
    return Report.model_validate(
        {
            "job_id": str(uuid.uuid4()),
            "status": "done",
            "mock": True,
            "video": video,
            "verdict": overall_verdict(checks),
            "checks": [c.model_dump() for c in checks],
            "tracks": [tr.model_dump() for tr in tracks],
            "transcript": [s.model_dump() for s in transcript],
            "models_used": MODELS_USED,
            "generated_at": datetime.now(UTC),
        }
    )
