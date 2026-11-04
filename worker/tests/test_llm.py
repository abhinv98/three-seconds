import http.client
import io
import json
import urllib.error

import pytest

import llm


def fake_urlopen(sent: list, finish_reason: str = "stop"):
    def urlopen(request, timeout):
        sent.append(request)
        message = {"role": "assistant", "reasoning_content": "thinking...", "content": "answer"}
        usage = {"prompt_tokens": 1_000_000, "completion_tokens": 2_000_000}
        choices = [{"message": message, "finish_reason": finish_reason}]
        return io.BytesIO(json.dumps({"choices": choices, "usage": usage}).encode())

    return urlopen


@pytest.mark.parametrize(
    ("name", "url", "model"),
    [
        (None, "https://inference.baseten.co/v1/chat/completions", "meta-models/muse-spark-open-1026"),
        (
            "fireworks",
            "https://api.fireworks.ai/inference/v1/chat/completions",
            "accounts/fireworks/models/muse-spark-open",
        ),
    ],
)
def test_chat_uses_the_chosen_provider_and_returns_only_the_answer(monkeypatch, name, url, model):
    if name:
        monkeypatch.setenv("PROVIDER", name)
    else:
        monkeypatch.delenv("PROVIDER", raising=False)
    monkeypatch.setenv("BASETEN_API_KEY", "b10_test")
    monkeypatch.setenv("FIREWORKS_API_KEY", "fw_test")
    sent = []
    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen(sent))

    reply = llm.chat([{"role": "user", "content": [llm.audio_part(b"RIFF")]}], reasoning_effort="low")
    assert reply.text == "answer"
    assert reply.cost_usd == (1.25 + 2 * 4.25 if name is None else None)
    body = json.loads(sent[0].data)
    assert sent[0].full_url == url
    assert body["model"] == model
    assert body["reasoning_effort"] == "low"
    assert body["messages"][0]["content"][0] == {
        "type": "audio_url",
        "audio_url": {"url": "data:audio/wav;base64,UklGRg=="},
    }


def test_chat_rejects_a_truncated_answer_and_an_unknown_provider(monkeypatch):
    monkeypatch.setenv("BASETEN_API_KEY", "b10_test")
    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen([], finish_reason="length"))
    with pytest.raises(llm.LLMError, match="max_tokens"):
        llm.chat([{"role": "user", "content": "hi"}])
    monkeypatch.setenv("PROVIDER", "openai")
    with pytest.raises(llm.LLMError, match="PROVIDER"):
        llm.chat([{"role": "user", "content": "hi"}])


NETWORK_FAILURES = [
    TimeoutError("timed out"),
    urllib.error.URLError("connection refused"),
    ConnectionResetError("reset by peer"),
    http.client.IncompleteRead(b"partial"),
]


@pytest.fixture
def baseten(monkeypatch):
    monkeypatch.delenv("PROVIDER", raising=False)
    monkeypatch.setenv("BASETEN_API_KEY", "b10_test")
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)


@pytest.mark.parametrize("failure", NETWORK_FAILURES, ids=lambda f: type(f).__name__)
def test_chat_retries_a_lost_request_once_then_raises_llm_error(monkeypatch, baseten, failure):
    calls = []

    def urlopen(request, timeout):
        calls.append(timeout)
        raise failure

    monkeypatch.setattr(llm.urllib.request, "urlopen", urlopen)
    with pytest.raises(llm.LLMError, match="no answer"):
        llm.chat([{"role": "user", "content": "hi"}])
    assert calls == [llm.REQUEST_TIMEOUT_S] * 2


@pytest.mark.parametrize("failure", NETWORK_FAILURES, ids=lambda f: type(f).__name__)
def test_chat_uses_the_answer_when_the_retry_works(monkeypatch, baseten, failure):
    good = fake_urlopen([])
    answers = iter([failure, None])

    def urlopen(request, timeout):
        answer = next(answers)
        if answer:
            raise answer
        return good(request, timeout)

    monkeypatch.setattr(llm.urllib.request, "urlopen", urlopen)
    assert llm.chat([{"role": "user", "content": "hi"}]).text == "answer"


@pytest.mark.parametrize("body", [b'{"choices": [', b'{"error": "busy"}', b'{"choices": []}', b"[]"])
def test_chat_turns_a_garbled_answer_into_llm_error(monkeypatch, baseten, body):
    monkeypatch.setattr(llm.urllib.request, "urlopen", lambda request, timeout: io.BytesIO(body))
    with pytest.raises(llm.LLMError):
        llm.chat([{"role": "user", "content": "hi"}])
