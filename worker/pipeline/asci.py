"""Verified rules from ASCI's Guidelines for Influencer Advertising in Digital Media."""

from __future__ import annotations

import re
import unicodedata

from models import Clause

SOURCE_URL = (
    "https://www.ascionline.in/wp-content/uploads/2023/08/GUIDELINES-FOR-INFLUENCER-ADVERTISING-IN-DIGITAL-MEDIA.pdf"
)

HOLD_SHORT = Clause(
    code="ASCI-IG 1.2e.I",
    text="For videos of 15 seconds or less, the disclosure label must stay for a minimum of 3 seconds.",
    source_url=SOURCE_URL,
)
HOLD_LONG = Clause(
    code="ASCI-IG 1.2e.II",
    text="For videos over 15 seconds and under 2 minutes, the disclosure label must stay for 1/3rd the length of the video.",
    source_url=SOURCE_URL,
)
LABELS = Clause(
    code="ASCI-IG 1.3a",
    text=(
        "Permitted labels: Advertisement, Ad, Sponsored, Collaboration, Partnership, Employee, Free gift,"
        " Paid Partnership (Instagram), Affiliate, Includes Paid Promotion (YouTube)."
    ),
    source_url=SOURCE_URL,
)

# 1.3a labels as words, so "Collab" and "Advertising" don't match but "#ad" and "Paid partnership with X" do.
# "partnership" covers Paid Partnership; "paid promotion" covers Includes Paid Promotion.
_LATIN = ["advertisement", "ad", "sponsored", "collaboration", "partnership", "employee", "free gift", "affiliate"]
_LATIN_RE = re.compile(r"(?<![a-z])(" + "|".join(_LATIN + ["paid promotion"]) + r")(?![a-z])")


def _devanagari(text: str) -> str:
    """NFC without the nukta, so मुफ़्त and मुफ्त (both common) compare equal."""
    return unicodedata.normalize("NFC", text).replace("़", "")


# Hindi equivalents, matched as substrings: word boundaries don't hold inside Devanagari.
_DEVANAGARI = [
    _devanagari(w)
    for w in ["विज्ञापन", "प्रायोजित", "सहयोग", "साझेदारी", "भागीदारी", "कर्मचारी", "मुफ़्त उपहार", "एफ़िलिएट", "सशुल्क प्रचार"]
]


def is_permitted(text: str) -> bool:
    """True if the text contains a 1.3a label or its Hindi equivalent."""
    return bool(_LATIN_RE.search(text.lower())) or any(w in _devanagari(text) for w in _DEVANAGARI)


def required_hold(duration_s: float) -> tuple[float, Clause] | None:
    """Seconds the label must stay on screen in one stretch, and the clause; None over 2 minutes (outside MVP scope).

    The duration is rounded to 0.1s first so a "15 second" Reel whose container reports 15.04s counts as 15.
    """
    d = round(duration_s, 1)
    if d <= 15:
        return 3.0, HOLD_SHORT
    if d <= 120:
        return d / 3, HOLD_LONG
    return None
