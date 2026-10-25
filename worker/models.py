"""Pydantic models for shared/report.schema.json.

Hand-written to mirror the schema; tests/test_contract.py validates the fixture against both.
"""

from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

Verdict = Literal["PASS", "FAIL", "REVIEW"]
CheckId = Literal["label_present", "label_duration", "spoken_disclosure", "label_language"]
Seconds = float


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VideoMeta(Strict):
    filename: str = Field(min_length=1)
    blob_url: str = Field(min_length=1)
    duration_s: float = Field(gt=0)
    width: int = Field(ge=0)
    height: int = Field(ge=0)
    fps_sampled: float = Field(gt=0)


class Clause(Strict):
    code: str = Field(min_length=1)
    text: str = Field(min_length=1)
    source_url: str | None


class Evidence(Strict):
    t_start: Seconds = Field(ge=0)
    t_end: Seconds = Field(ge=0)
    kind: Literal["frame", "audio"]
    note: str


class Fix(Strict):
    steps: list[str] = Field(min_length=1, max_length=3)


class Check(Strict):
    id: CheckId
    title: str = Field(min_length=1)
    verdict: Verdict
    detail: str
    clause: Clause | None
    evidence: list[Evidence]
    fix: Fix | None = None


class Span(Strict):
    t_start: Seconds = Field(ge=0)
    t_end: Seconds = Field(ge=0)


class Track(Strict):
    label: str = Field(min_length=1)
    kind: Literal["disclosure_label", "brand"]
    spans: list[Span]
    first_seen_s: Seconds | None = Field(ge=0)
    last_seen_s: Seconds | None = Field(ge=0)
    total_on_screen_s: Seconds = Field(ge=0)
    max_frame_share: float = Field(ge=0, le=1)


class TranscriptSegment(Strict):
    t_start: Seconds = Field(ge=0)
    t_end: Seconds = Field(ge=0)
    text: str
    lang: str


class Report(Strict):
    job_id: str = Field(min_length=1)
    status: Literal["done", "error"]
    mock: bool
    video: VideoMeta
    verdict: Verdict
    checks: list[Check]
    tracks: list[Track]
    transcript: list[TranscriptSegment]
    models_used: list[str]
    generated_at: AwareDatetime


class AnalyzeRequest(Strict):
    blob_url: str = Field(min_length=1, max_length=2048)
    filename: str = Field(min_length=1, max_length=255)
    duration_s: float | None = Field(default=None, gt=0)
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
