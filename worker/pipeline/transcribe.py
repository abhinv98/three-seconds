"""The audio track, transcribed by Muse Voice Transcribe (meta_api.py).

Muse answers with one turn per utterance and only that turn's start and end, and continuous speech is one long
turn, so each turn is split into sentences and each sentence gets a share of the turn's time by its length:
estimates, good to a second or two. The API names no language, so each line's lang comes from its script:
hi-Deva for Devanagari (Muse writes spoken Hinglish in Devanagari too), hi-Latn for Latin script with common
Hindi words in it, und for other scripts, en otherwise.

Without META_API_KEY, or when the request fails, the audio is not checked and the label checks stand alone.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import meta_api
from models import TranscriptSegment

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Audio:
    checked: bool
    """False when the speech wasn't transcribed: no META_API_KEY, or the request failed."""
    transcript: list[TranscriptSegment] = field(default_factory=list)
    has_track: bool = True
    failed: bool = False
    cost_usd: float = 0.0
    model: str | None = None
    """The transcription model, when it was called."""


def listen(video: Path) -> Audio:
    """Transcribe the video's audio track. Never raises: a failure is Audio(checked=False, failed=True)."""
    try:
        if not _has_audio_track(video):
            return Audio(checked=True, has_track=False)
        if not os.environ.get("META_API_KEY"):
            log.info("audio not checked: META_API_KEY is not set")
            return Audio(checked=False)
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp, "audio.wav")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le"]
                + ["-map_metadata", "-1", str(wav)],
                check=True,
                capture_output=True,
                timeout=60,
            )
            data, cost = meta_api.transcribe(wav.read_bytes())
        return Audio(
            checked=True, transcript=lines(data.get("turns") or []), cost_usd=cost, model=meta_api.TRANSCRIBE_MODEL
        )
    except Exception as e:  # The audio is optional: the label checks still stand without it.
        log.warning("audio not checked: %s", e)
        return Audio(checked=False, failed=True)


def _has_audio_track(video: Path) -> bool:
    streams = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0"]
        + [str(video)],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout
    return bool(streams.strip())


_SENTENCE_END = re.compile(r"(?<=[.?!।])\s+")


def lines(turns: list[dict]) -> list[TranscriptSegment]:
    """One transcript line per sentence, timed by its share of the turn's text."""
    out = []
    for turn in turns:
        sentences = [s for s in _SENTENCE_END.split(" ".join(str(turn.get("transcript", "")).split())) if s]
        start = turn["startMs"] / 1000
        end = max(turn["endMs"] / 1000, start)
        total, done = sum(map(len, sentences)), 0
        for sentence in sentences:
            t_start = start + (end - start) * done / total
            done += len(sentence)
            t_end = start + (end - start) * done / total
            out.append(
                TranscriptSegment(
                    t_start=round(t_start, 1), t_end=round(t_end, 1), text=sentence, lang=language(sentence)
                )
            )
    return out


_HINDI_WORDS = frozenset(
    "hai hain ka ki ke ko se mein yeh ye kya nahi nahin aur bhi kar karo karke kiya raha rahi rahe hoon tha thi"
    " toh bahut aap hum mera meri apna apni ek bas dekho lagta wala wali".split()
)
"""Hinglish written in Latin script: two of these, at least a fifth of the words, make a line hi-Latn."""


def language(text: str) -> str:
    """BCP 47 tag from the script: hi-Deva, hi-Latn, en, or und for any other script."""
    deva = sum("ऀ" <= c <= "ॿ" for c in text)
    latin = sum(c.isascii() and c.isalpha() for c in text)
    other = sum(c.isalpha() for c in text) - latin - sum(c.isalpha() and "ऀ" <= c <= "ॿ" for c in text)
    if deva > latin and deva >= other:
        return "hi-Deva"
    if other > latin:
        return "und"
    words = re.findall(r"[a-z]+", text.lower())
    hindi = sum(w in _HINDI_WORDS for w in words)
    return "hi-Latn" if hindi >= 2 and hindi * 5 >= len(words) else "en"
