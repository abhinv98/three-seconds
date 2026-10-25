import json

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from main import app
from models import Report
from pipeline.fixture import FIXTURE_PATH, SCHEMA_PATH

SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=Draft202012Validator.FORMAT_CHECKER)
client = TestClient(app)


def errors_for(instance: object) -> list[str]:
    return [f"{list(e.path)}: {e.message}" for e in VALIDATOR.iter_errors(instance)]


def test_fixture_matches_schema():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert errors_for(fixture) == []
    Report.model_validate(fixture)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_analyze_returns_a_valid_report_for_the_real_file():
    response = client.post(
        "/analyze",
        json={"blob_url": "https://example.invalid/videos/reel.mp4", "filename": "reel.mp4", "duration_s": 14},
    )
    assert response.status_code == 200
    report = response.json()
    assert errors_for(report) == []
    assert report["video"]["filename"] == "reel.mp4"
    assert report["video"]["duration_s"] == 14
    assert report["job_id"] != "mock-0001"
    label = next(t for t in report["tracks"] if t["kind"] == "disclosure_label")
    assert label["spans"][0] == {"t_start": 0.2, "t_end": 1.1}
    duration_check = next(c for c in report["checks"] if c["id"] == "label_duration")
    assert duration_check["detail"].startswith("Label held 0.9s.")


def test_analyze_rejects_a_missing_filename():
    response = client.post("/analyze", json={"blob_url": "https://example.invalid/v.mp4"})
    assert response.status_code == 422
