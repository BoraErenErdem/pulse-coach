"""scripts/warm_models.py: modeller uygulamanın ayarlarıyla yüklenir, hata açılışı durdurmaz."""

from app.config import get_settings
from scripts import warm_models


class _Ok:
    def raise_for_status(self):
        return None


def test_warms_chat_photo_and_embedding_with_app_settings(monkeypatch):
    settings = get_settings()
    calls = []
    monkeypatch.setattr(warm_models.requests, "get", lambda url, timeout: _Ok())

    def fake_post(url, json, timeout):
        calls.append((url, json))
        return _Ok()

    monkeypatch.setattr(warm_models.requests, "post", fake_post)

    assert warm_models.warm_models() == len(calls)
    chat_calls = [body for url, body in calls if url.endswith("/api/chat")]
    assert [body["model"] for body in chat_calls] == list(
        dict.fromkeys([settings.llm_model_name, settings.photo_vision_model_name])
    )
    for body in chat_calls:
        # num_ctx uygulamanınkinden farklı olsaydı ilk gerçek istek modeli yeniden yüklerdi.
        assert body["options"]["num_ctx"] == settings.llm_num_ctx
        assert body["keep_alive"] == settings.llm_keep_alive
    embed_calls = [body for url, body in calls if url.endswith("/api/embed")]
    assert [body["model"] for body in embed_calls] == [settings.embedding_model_name]


def test_failure_is_reported_not_raised(monkeypatch):
    monkeypatch.setattr(warm_models.requests, "get", lambda url, timeout: _Ok())

    def refuse(url, json, timeout):
        raise warm_models.requests.ConnectionError("refused")

    monkeypatch.setattr(warm_models.requests, "post", refuse)
    assert warm_models.warm_models() == 0


def test_skips_when_ollama_never_answers(monkeypatch):
    def refuse(url, timeout):
        raise warm_models.requests.ConnectionError("refused")

    def unexpected_post(url, json, timeout):
        raise AssertionError("Ollama yanıt vermezken model yüklenmeye çalışılmamalı")

    monkeypatch.setattr(warm_models.requests, "get", refuse)
    monkeypatch.setattr(warm_models.requests, "post", unexpected_post)
    monkeypatch.setattr(warm_models, "OLLAMA_WAIT_S", 0)
    assert warm_models.warm_models() == 0
