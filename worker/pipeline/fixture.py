"""Paths to the shared report contract and its mock fixture (tests/test_contract.py checks both)."""

from __future__ import annotations

from pathlib import Path

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "mock-report.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "report.schema.json"
