"""Three Seconds analysis worker.

Run locally:  uv run uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI

from models import AnalyzeRequest, Report
from pipeline.report import build_report

app = FastAPI(title="Three Seconds worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/analyze", response_model=Report, response_model_exclude_none=False)
def analyze(request: AnalyzeRequest) -> Report:
    return build_report(request)
