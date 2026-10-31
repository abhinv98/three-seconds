"""Verified rules from ASCI's Guidelines for Influencer Advertising in Digital Media."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from models import Clause

CLAUSES_PATH = Path(__file__).resolve().parents[2] / "shared" / "asci-clauses.json"
"""Verbatim clause text and the guideline's URL, shared with web/ (mock report, landing copy)."""
_DATA = json.loads(CLAUSES_PATH.read_text(encoding="utf-8"))
_CLAUSES = {c["code"]: Clause(code=c["code"], text=c["text"], source_url=_DATA["source_url"]) for c in _DATA["clauses"]}

HOLD_SHORT = _CLAUSES["ASCI-IG 1.2e.I"]
HOLD_LONG = _CLAUSES["ASCI-IG 1.2e.II"]
LABELS = _CLAUSES["ASCI-IG 1.3a"]

# 1.3a labels as words, so "Collab" and "Advertising" don't match but "#ad" and "Paid partnership with X" do.
# "partnership" covers Paid Partnership; "paid promotion" covers Includes Paid Promotion.
_LATIN = ["advertisement", "ad", "sponsored", "collaboration", "partnership", "employee", "free gift", "affiliate"]
_LATIN_RE = re.compile(r"(?<![a-z])(" + "|".join(_LATIN + ["paid promotion"]) + r")(?![a-z])")


def _devanagari(text: str) -> str:
    """NFC without the nukta, so मुफ़्त and मुफ्त (both common) compare equal."""
    return unicodedata.normalize("NFC", text).replace("\u093c", "")


# Hindi equivalents, matched as substrings: word boundaries don't hold inside Devanagari.
_DEVANAGARI = [
    _devanagari(w)
    for w in ["विज्ञापन", "प्रायोजित", "सहयोग", "साझेदारी", "भागीदारी", "कर्मचारी", "मुफ़्त उपहार", "एफ़िलिएट", "सशुल्क प्रचार"]
]


def is_permitted(text: str) -> bool:
    """True if the text contains a 1.3a label or its Hindi equivalent."""
    return bool(_LATIN_RE.search(text.lower())) or any(w in _devanagari(text) for w in _DEVANAGARI)


def required_hold(duration_s: float) -> tuple[float, Clause]:
    """Seconds the label must stay on screen in one stretch (1.2e), and the clause.

    Uploads are capped at 90s (frames.MAX_DURATION_S), inside 1.2e.II's 2-minute range, so 1.2e.III
    (2 minutes or longer) never applies. The duration is rounded to 0.1s first so a "15 second" Reel
    whose container reports 15.04s counts as 15.
    """
    d = round(duration_s, 1)
    return (3.0, HOLD_SHORT) if d <= 15 else (d / 3, HOLD_LONG)
