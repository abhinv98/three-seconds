import pytest


@pytest.fixture(autouse=True)
def no_meta_key(monkeypatch):
    """No test reaches Meta's API, even with worker/.env loaded; audio tests fake meta_api.transcribe."""
    monkeypatch.delenv("META_API_KEY", raising=False)
