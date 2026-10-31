"""Worker settings read from the environment (worker/.env, see worker/.env.example)."""

from __future__ import annotations

import os

LABEL_MIN_SECONDS = float(os.environ.get("LABEL_MIN_SECONDS", "3"))
"""Shortest continuous hold that passes label_duration. Not yet verified against the ASCI guideline."""
