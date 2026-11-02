import io
import json
import subprocess
import urllib.error

import pytest

import meta_api
from models import Check, TranscriptSegment
from pipeline import asci
from pipeline.rules import evaluate_rules
from pipeline.track import label_track
from pipeline.transcribe import Audio, lines, listen
from pipeline.vision import FrameReading


@pytest.mark.parametrize(
    "text",
    [
        "this video is sponsored by sandskin.",  # Muse on the English stand-in clip
        "ये वीडियो साझ स्किन द्वारा प्रायोजित है।",  # Hindi stand-in
        "ये वीडियो सांच स्किन के साथ पेड पार्टनरशिप में है।",  # Hinglish stand-in, which Muse writes in Devanagari
        "Yeh video sponsored hai.",
        "Thanks to Nykaa for sponsoring this video!",
        "It’s a paid partnership with Nykaa.",
        "This is an ad.",
        "is video ko Nykaa ne sponsor kiya hai",
        "यह एक ऐड है।",
        "In collaboration with Lakmé.",
    ],
)
def test_spoken_disclosures_are_heard(text):
    assert asci.said_out_loud(text)


@pytest.mark.parametrize(
    "text",
    [
        "मॉइस्चराइजर में बस दो drops add करो.",  # Muse on the no-disclosure stand-in
        "दो ड्रॉप्स ऐड करो।",
        "You can make an ad for any local brand.",  # a Reel about making ads
        "Buzzy makes branding ads in minutes.",
        "This is not sponsored, I just love it.",
        "No, this isn't an ad.",
        "Ye video sponsored nahi hai.",
        "ये प्रायोजित नहीं है।",
        "Comment Buzi and I'll send you the link",
    ],
)
def test_other_speech_is_not_a_disclosure(text):
    assert not asci.said_out_loud(text)


def test_a_long_turn_is_split_into_sentences_timed_by_length():
    turn = {"startMs": 1000, "endMs": 11000, "transcript": "Hi everyone.  Yeh video sponsored hai! ये प्रायोजित है।"}
    got = lines([turn])
    assert [(s.text, s.lang) for s in got] == [
        ("Hi everyone.", "en"),
        ("Yeh video sponsored hai!", "hi-Latn"),
        ("ये प्रायोजित है।", "hi-Deva"),
    ]
    assert (got[0].t_start, got[-1].t_end) == (1.0, 11.0)
    assert [s.t_end for s in got[:-1]] == [s.t_start for s in got[1:]]
    assert lines([{"startMs": 0, "endMs": 0, "transcript": ""}]) == []


@pytest.fixture(scope="module")
def videos(tmp_path_factory):
    """A 2s video with a tone on its audio track, and one with no audio track."""
    folder = tmp_path_factory.mktemp("audio")
    tone, silent = folder / "tone.mp4", folder / "silent.mp4"
    picture = ["-f", "lavfi", "-i", "color=c=gray:s=32x32:r=30:d=2"]
    subprocess.run(
        ["ffmpeg", "-v", "error", *picture, "-f", "lavfi", "-i", "sine=f=440:d=2", "-shortest", "-pix_fmt", "yuv420p"]
        + [str(tone)],
        check=True,
    )
    subprocess.run(["ffmpeg", "-v", "error", *picture, "-pix_fmt", "yuv420p", str(silent)], check=True)
    return tone, silent


def test_listen_sends_the_audio_track_and_times_the_lines(monkeypatch, videos):
    monkeypatch.setenv("META_API_KEY", "test")
    sent = []

    def transcribe(wav):
        sent.append(wav)
        turn = {"turnId": 0, "startMs": 100, "endMs": 1900, "transcript": "This video is sponsored by Nykaa."}
        return {"audioDurationMs": 2000, "turns": [turn]}, 0.0001

    monkeypatch.setattr(meta_api, "transcribe", transcribe)
    audio = listen(videos[0])
    assert sent[0][:4] == b"RIFF"
    assert (audio.checked, audio.model, audio.cost_usd) == (True, "muse-voice-transcribe-1.0", 0.0001)
    assert audio.transcript == [
        TranscriptSegment(t_start=0.1, t_end=1.9, text="This video is sponsored by Nykaa.", lang="en")
    ]


def test_listen_falls_back_to_not_checked(monkeypatch, videos):
    assert listen(videos[0]) == Audio(checked=False)  # no META_API_KEY
    assert listen(videos[1]) == Audio(checked=True, has_track=False)  # no audio track: nothing to send
    monkeypatch.setenv("META_API_KEY", "test")

    def fail(wav):
        raise meta_api.MetaAPIError("HTTP 500")

    monkeypatch.setattr(meta_api, "transcribe", fail)
    assert listen(videos[0]) == Audio(checked=False, failed=True)


def test_transcribe_retries_a_busy_api_and_caps_the_wait(monkeypatch):
    monkeypatch.setenv("META_API_KEY", "test")
    answers = [
        urllib.error.HTTPError("u", 503, "busy", {"Retry-After": "60"}, io.BytesIO(b"")),  # type: ignore[arg-type]
        io.BytesIO(json.dumps({"audioDurationMs": 62400, "turns": []}).encode()),
    ]
    waits: list[float] = []

    def urlopen(request, timeout):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(meta_api.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(meta_api.time, "sleep", waits.append)
    data, cost = meta_api.transcribe(b"RIFF")
    assert data["audioDurationMs"] == 62400
    assert cost == pytest.approx(62 * 0.18 / 3600)  # whole seconds, rounded down
    assert len(waits) == 1 and 10 <= waits[0] <= 10.25

    answers[:] = [urllib.error.HTTPError("u", 400, "bad", {}, io.BytesIO(b"not a WAV"))]  # type: ignore[arg-type]
    with pytest.raises(meta_api.MetaAPIError, match="HTTP 400: not a WAV"):
        meta_api.transcribe(b"RIFF")
    assert len(waits) == 1  # a 400 is never retried


def heard(*said: tuple[str, str]) -> Audio:
    """One second per line."""
    return Audio(
        checked=True,
        transcript=[TranscriptSegment(t_start=i, t_end=i + 1, text=t, lang=lang) for i, (t, lang) in enumerate(said)],
    )


def checks_for(label: str | None, audio: Audio | None) -> dict[str, Check]:
    """A 4s video with this label on screen the whole time (None: no label)."""
    readings = [FrameReading(i / 2, label is not None, "label", label or "") for i in range(8)]
    checks = evaluate_rules(readings, label_track(readings, 2.0, 4.0), 2.0, 4.0, audio=audio)
    return {c.id: c for c in checks}


def test_spoken_disclosure_passes_with_about_when_it_was_said():
    spoken = checks_for(None, heard(("Hey guys.", "en"), ("Yeh video sponsored hai.", "hi-Latn")))["spoken_disclosure"]
    assert (spoken.verdict, spoken.detail) == ("PASS", 'Said at about 00:01.0: "Yeh video sponsored hai."')
    assert [(e.kind, e.t_start, e.note) for e in spoken.evidence] == [
        ("audio", 1.0, '"Yeh video sponsored hai." Hinglish')
    ]


@pytest.mark.parametrize(
    ("audio", "detail"),
    [
        (None, "Audio not checked yet."),
        (Audio(checked=False, failed=True), "Audio couldn't be checked this time."),
        (Audio(checked=True, has_track=False), "This video has no audio."),
        (Audio(checked=True), "No speech heard."),
        (
            heard(("Comment Buzi and I'll send you the link", "en")),
            "Not said out loud. ASCI asks for that only in live streams and audio ads.",
        ),
    ],
)
def test_spoken_disclosure_is_info_otherwise(audio, detail):
    spoken = checks_for(None, audio)["spoken_disclosure"]
    assert (spoken.verdict, spoken.detail, spoken.evidence) == ("INFO", detail, [])


@pytest.mark.parametrize(
    ("label", "speech", "verdict"),
    [
        ("Paid partnership", "hi-Deva", "PASS"),  # English is fine on an ad in any language
        ("प्रायोजित", "hi-Deva", "PASS"),
        ("प्रायोजित", "hi-Latn", "PASS"),
        ("प्रायोजित", "en", "REVIEW"),
        ("प्रायोजित", None, "INFO"),  # no speech to say what the ad's language is
        (None, "en", "INFO"),  # no label
    ],
)
def test_label_language_follows_1_3b(label, speech, verdict):
    audio = heard(("Some speech.", speech)) if speech else Audio(checked=True)
    check = checks_for(label, audio)["label_language"]
    assert (check.verdict, check.clause.code) == (verdict, "ASCI-IG 1.3b")
    assert (check.fix is not None) == (verdict == "REVIEW")
