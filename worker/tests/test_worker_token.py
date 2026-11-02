"""The worker answers checks only for the web app once WORKER_TOKEN is set, and refuses them deployed without one."""

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
# Not a Blob URL, so a request that gets past the token is turned away by the pipeline with 400, before any download.
CHECK = {"blob_url": "https://example.com/reel.mp4", "filename": "reel.mp4"}


def test_local_development_needs_no_token(monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert client.post("/analyze", json=CHECK).status_code == 400


def test_a_deploy_without_a_token_refuses_every_check(monkeypatch):
    monkeypatch.delenv("WORKER_TOKEN", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert client.post("/analyze", json=CHECK).status_code == 503


def test_only_the_shared_token_gets_through(monkeypatch):
    monkeypatch.setenv("WORKER_TOKEN", "s3cret")
    assert client.post("/analyze", json=CHECK).status_code == 401
    assert client.post("/analyze", json=CHECK, headers={"authorization": "Bearer nope"}).status_code == 401
    assert client.post("/analyze", json=CHECK, headers={"authorization": "Bearer s3cret"}).status_code == 400
    assert client.post("/analyze-upload?filename=a.mp4&source_url=x", content=b"", headers={"authorization": "x"}).status_code == 401
    assert client.get("/health").status_code == 200
