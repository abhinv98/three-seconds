"""Three Seconds analysis worker.

Run locally:  uv run uvicorn main:app --reload --port 8000
"""

import logging

from fastapi import FastAPI, HTTPException

from models import AnalyzeRequest, Report
from pipeline.frames import VideoError
from pipeline.report import build_report

# Pipeline logs (frames read, edge refinement, cost per video) next to uvicorn's own lines.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")

app = FastAPI(title="Three Seconds worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/analyze", response_model=Report, response_model_exclude_none=False)
def analyze(request: AnalyzeRequest) -> Report:
    try:
        return build_report(request)
    except VideoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
