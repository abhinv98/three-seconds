import io
import json

import pytest

import llm


def fake_urlopen(sent: list, finish_reason: str = "stop"):
    def urlopen(request, timeout):
        sent.append(request)
        message = {"role": "assistant", "reasoning_content": "thinking...", "content": "answer"}
        return io.BytesIO(json.dumps({"choices": [{"message": message, "finish_reason": finish_reason}]}).encode())

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

    assert llm.chat([{"role": "user", "content": [llm.audio_part(b"RIFF")]}], reasoning_effort="low") == "answer"
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
