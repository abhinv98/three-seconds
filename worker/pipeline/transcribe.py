"""Speech transcription with Muse Voice Transcribe.

The real stage extracts the audio track and transcribes it with Muse Voice Transcribe, keeping
Hindi in Devanagari (hi-Deva), Hinglish in Latin script (hi-Latn) and English (en) per segment.

Stub: returns the fixture's transcript. No model is called.
"""

from __future__ import annotations

from models import TranscriptSegment
from pipeline.fixture import load_fixture


def transcribe(video_url: str) -> list[TranscriptSegment]:
    """Transcribe the video's speech.

    Args:
        video_url: Public Blob URL of the uploaded video.

    Returns:
        Time-coded segments with a BCP 47 language tag each.
    """
    return [TranscriptSegment.model_validate(s) for s in load_fixture()["transcript"]]
