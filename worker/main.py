"""Three Seconds analysis worker.

Run locally:  uv run uvicorn main:app --reload --port 8000
Deployed on Vercel as its own project (FastAPI); build.py puts ffmpeg and ffprobe in bin/.
"""

import hmac
import logging
import os
import tempfile
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from models import AnalyzeRequest, FramesRequest, Report, SceneRequest, TrackRequest
from pipeline import details, scene
from pipeline.frames import MAX_BYTES, VideoError, download, probe
from pipeline.report import analyze_video, build_report

# Pipeline logs (frames read, edge refinement, cost per video) next to uvicorn's own lines.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")

# The pipeline runs ffmpeg and ffprobe by name. On Vercel they come from build.py, ahead of anything else on PATH.
BIN = Path(__file__).resolve().parent / "bin"
if BIN.is_dir():
    os.environ["PATH"] = f"{BIN}{os.pathsep}{os.environ.get('PATH', '')}"

app = FastAPI(title="Three Seconds worker", version="0.1.0")


def require_token(authorization: str | None = Header(default=None)) -> None:
    """The secret this worker shares with the web app (WORKER_TOKEN), so nobody else spends its model credits.

    Unset is allowed only off Vercel, for local development; a deploy without it refuses every check.
    """
    token = os.environ.get("WORKER_TOKEN", "")
    if not token:
        if os.environ.get("VERCEL"):
            raise HTTPException(status_code=503, detail="WORKER_TOKEN is not set")
        return
    if not hmac.compare_digest((authorization or "").encode(), f"Bearer {token}".encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/analyze", response_model=Report, response_model_exclude_none=False, dependencies=[Depends(require_token)])
def analyze(request: AnalyzeRequest) -> Report:
    try:
        return build_report(request)
    except VideoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/frames", dependencies=[Depends(require_token)])
def frames(request: FramesRequest) -> dict:
    """The finer-details pass: stills for the model that finds what to change, and a poster frame."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            video = download(request.blob_url, Path(tmp) / "video")
            duration, width, height = probe(video)
            out = Path(tmp, "frames")
            out.mkdir()
            return {
                "duration_s": round(duration, 3),
                "width": width,
                "height": height,
                "frames": details.frame_payload(video, out, request.fps, request.width),
                "poster": details.b64(details.still(video, min(0.5, duration / 2), 540)),
            }
    except VideoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/track", dependencies=[Depends(require_token)])
def track(request: TrackRequest) -> dict:
    """The finer-details pass: SAM 3.1 follows each thing the model pointed at; a still per change."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            video = download(request.blob_url, Path(tmp) / "video")
            duration, _, _ = probe(video)
            objects = [o.model_dump() for o in request.objects]
            return details.track_and_stills(video, duration, objects, request.stills)
    except VideoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/scene", dependencies=[Depends(require_token)])
def scene_route(request: SceneRequest) -> dict:
    """The Studio's data: SAM 3.1 on the whole Reel for each concept, plus its cuts, waveform and filmstrip."""
    deadline = time.monotonic() + scene.BUDGET_S  # The download counts against the same 300 s.
    try:
        with tempfile.TemporaryDirectory() as tmp:
            video = download(request.blob_url, Path(tmp) / "video")
            concepts = [c.model_dump() for c in request.concepts]
            return scene.build_scene(video, concepts, request.fps, request.width, deadline)
    except VideoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/analyze-upload", response_model=Report, response_model_exclude_none=False, dependencies=[Depends(require_token)])
async def analyze_upload(
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
    source_url: str = Query(min_length=1, max_length=2048),
) -> Report:
    """Development only, behind ALLOW_UPLOADS=1: the web app's dev server posts the video's bytes here.

    Without a Blob token the video never leaves the browser, so there is no URL to download; the bytes come
    straight from the web dev server instead. source_url is only echoed into the report, for playback in the
    tab; it is never fetched. Same 100 MB cap as /analyze.
    """
    if os.environ.get("ALLOW_UPLOADS") != "1":
        raise HTTPException(status_code=404)
    with tempfile.TemporaryDirectory() as tmp:
        video, size = Path(tmp) / "video", 0
        with video.open("wb") as out:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail=f"Video is larger than {MAX_BYTES // (1024 * 1024)} MB")
                out.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The request had no video in it.")
        try:
            return (await run_in_threadpool(analyze_video, video, filename, source_url)).report
        except VideoError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
