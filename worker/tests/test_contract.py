import json

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

import llm
import pipeline.report as report_module
from main import app
from models import Report
from pipeline.fixture import FIXTURE_PATH, SCHEMA_PATH

SAMPLE_REEL = FIXTURE_PATH.parents[2] / "web" / "public" / "sample" / "glow-serum-reel.mp4"

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


def fake_chat(messages, **params):
    """Label on screen from 0.5s to 4.0s; the answer for t=5.0 is missing, so that frame is unknown."""
    times = [float(p["text"][2:]) for p in messages[0]["content"] if p["type"] == "text" and p["text"].startswith("t=")]
    rows = [
        {
            "t": t,
            "label_present": 0.5 <= t < 4.0,
            "kind": "label",
            "label_text": "Paid partnership",
            "position": "top-left",
        }
        for t in times
        if t != 5.0
    ]
    return llm.Reply(f"Here you go:\n```json\n{json.dumps(rows)}\n```", 1000, 100, 0.001)


def test_analyze_runs_the_pipeline_on_the_uploaded_file(monkeypatch):
    monkeypatch.setattr(report_module, "download", lambda url, dest: SAMPLE_REEL)
    monkeypatch.setattr(llm, "chat", fake_chat)
    response = client.post(
        "/analyze",
        json={"blob_url": "https://x.public.blob.vercel-storage.com/videos/reel.mp4", "filename": "reel.mp4"},
    )
    assert response.status_code == 200
    report = response.json()
    assert errors_for(report) == []
    assert report["mock"] is False
    assert report["video"]["duration_s"] == 28
    assert report["video"]["fps_sampled"] == 2
    [label] = report["tracks"]
    assert label["spans"] == [{"t_start": 0.5, "t_end": 4.0}]
    assert (label["first_seen_s"], label["total_on_screen_s"], label["longest_continuous_s"]) == (0.5, 3.5, 3.5)
    checks = {c["id"]: c for c in report["checks"]}
    assert checks["label_present"]["verdict"] == "PASS"
    assert checks["label_present"]["clause"]["code"] == "ASCI-IG 1.3a"
    # 28s video: 1.2e.II needs 9.3s and 3.5s is held; the unread frame at 5.0s is not adjacent, so it cannot help.
    assert checks["label_duration"]["verdict"] == "FAIL"
    assert checks["label_duration"]["clause"]["code"] == "ASCI-IG 1.2e.II"
    assert checks["label_duration"]["evidence"] == [
        {"t_start": 0.5, "t_end": 4.0, "kind": "label", "note": '"Paid partnership" label, top-left'},
        {"t_start": 5.0, "t_end": 5.5, "kind": "frame", "note": "Frames could not be read"},
    ]
    assert checks["label_language"]["verdict"] == "PASS"  # an English label suits an ad in any language
    assert checks["spoken_disclosure"]["verdict"] == "INFO"
    assert checks["spoken_disclosure"]["detail"] == "Audio not checked yet."  # no META_API_KEY in tests
    assert report["audio_checked"] is False
    assert report["verdict"] == "FAIL"


def test_analyze_only_fetches_vercel_blob_urls():
    response = client.post("/analyze", json={"blob_url": "http://169.254.169.254/latest", "filename": "v.mp4"})
    assert response.status_code == 400
    assert "vercel-storage.com" in response.json()["detail"]


def test_analyze_rejects_a_missing_filename():
    response = client.post("/analyze", json={"blob_url": "https://example.invalid/v.mp4"})
    assert response.status_code == 422


UPLOAD_PARAMS = {"filename": "reel.mp4", "source_url": "blob:http://localhost:3000/4b1e"}


def test_analyze_upload_is_off_without_the_dev_flag(monkeypatch):
    monkeypatch.delenv("ALLOW_UPLOADS", raising=False)
    assert client.post("/analyze-upload", params=UPLOAD_PARAMS, content=b"video").status_code == 404


def test_analyze_upload_runs_the_pipeline_on_the_posted_bytes(monkeypatch):
    monkeypatch.setenv("ALLOW_UPLOADS", "1")
    monkeypatch.setattr(llm, "chat", fake_chat)
    assert client.post("/analyze-upload", params=UPLOAD_PARAMS, content=b"").status_code == 400
    response = client.post("/analyze-upload", params=UPLOAD_PARAMS, content=SAMPLE_REEL.read_bytes())
    assert response.status_code == 200
    report = response.json()
    assert errors_for(report) == []
    assert report["video"]["blob_url"] == UPLOAD_PARAMS["source_url"]   # echoed for playback, never fetched


def test_analyze_upload_caps_the_size(monkeypatch):
    import main

    monkeypatch.setenv("ALLOW_UPLOADS", "1")
    monkeypatch.setattr(main, "MAX_BYTES", 10)
    assert client.post("/analyze-upload", params=UPLOAD_PARAMS, content=b"x" * 11).status_code == 413
