"""Loads the shared mock fixture that every stub returns slices of."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "mock-report.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "report.schema.json"


@lru_cache(maxsize=1)
def _raw() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


def load_fixture() -> dict:
    """A fresh copy of shared/fixtures/mock-report.json (a 28 second Hinglish beauty Reel)."""
    return json.loads(_raw())
