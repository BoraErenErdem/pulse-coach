"""Yanıt uzunluğu (2026-09-26): kısa isteyene kısa, normal soruya normal, detay/
açıklama isteyene uzun yanıt - sınıf mesajdan belirlenir ve modele söylenir."""

import pytest

from app.agents import orchestrator as orchestrator_module
from app.agents.orchestrator import reply_length_level
from app.agents.prompts import build_orchestrator_system_prompt, reply_length_directive


@pytest.mark.parametrize(
    ("message", "level"),
    [
        ("Kahvaltıda ne yemeliyim? Kısaca.", "brief"),
        ("Su neden önemli, kısaca söyle", "brief"),
        ("kisaca anlat", "brief"),
        ("Kısa bir cevap ver", "brief"),
        ("Tek cümleyle protein nedir?", "brief"),
        ("Özetler misin?", "brief"),
        ("ozetle", "brief"),
        ("kısa ve öz olsun", "brief"),
        ("Briefly, what is BMR?", "brief"),
        ("Kısaca açıklar mısın?", "brief"),  # ikisi birden: kısa kazanır
        ("Kahvaltıda ne yemeliyim?", "medium"),
        ("Haftada kaç gün antrenman yapmalıyım?", "medium"),
        # Uzunluk isteği OLMAYAN "kısa"/"uzun" kullanımları (eskiden yanlış sınıflanıyordu).
        ("Kısa mesafe koşu mu uzun mesafe mi?", "medium"),
        ("Uzun süre koştum, ne yemeliyim?", "medium"),
        ("Kısa sürede kilo verebilir miyim?", "medium"),
        ("I went for a long run today", "medium"),
        ("Squat formunu adım adım açıklar mısın?", "detailed"),
        ("Kas kazanımını detaylı anlat", "detailed"),
        ("Bunu açıklar mısın?", "detailed"),
        ("Uyku ve toparlanmayı kapsamlı anlat", "detailed"),
        ("Ayrıntılı bilgi verir misin", "detailed"),
        ("uzun uzun anlat", "detailed"),
        ("Explain progressive overload", "detailed"),
        ("Give me a step-by-step plan", "detailed"),
    ],
)
def test_reply_length_level(message, level):
    assert reply_length_level(message) == level


@pytest.mark.parametrize("level", ["brief", "medium", "detailed"])
@pytest.mark.parametrize("language", ["tr", "en"])
def test_length_directive_is_the_last_thing_in_the_prompt(level, language):
    prompt = build_orchestrator_system_prompt(None, False, language, "sicak", reply_length=level)
    assert prompt.endswith(reply_length_directive(level, language))


def test_prepare_passes_the_message_level_to_the_prompt(monkeypatch):
    captured = {}

    def fake_build(*args, **kwargs):
        captured.update(kwargs)
        return "prompt"

    monkeypatch.setattr(orchestrator_module, "build_orchestrator_system_prompt", fake_build)
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: object())
    monkeypatch.setattr(orchestrator_module.profile_service, "get_language", lambda db, uid: "tr")
    monkeypatch.setattr(orchestrator_module.profile_service, "get_coach_tone", lambda db, uid: "notr")
    monkeypatch.setattr(orchestrator_module.mood_service, "get_mood", lambda db, uid: None)
    monkeypatch.setattr(orchestrator_module.mood_service, "is_persistent_low_mood", lambda db, uid: False)
    monkeypatch.setattr(orchestrator_module, "_load_history", lambda db, uid: [])
    for name in (
        "build_profile_tools",
        "build_tracking_tools",
        "build_workout_tracking_tools",
        "build_nutrition_tracking_tools",
        "build_motivation_tools",
    ):
        monkeypatch.setattr(orchestrator_module, name, lambda db, uid: [])

    orchestrator_module._prepare(None, 1, "Squat formunu adım adım açıklar mısın?", None)  # type: ignore[arg-type]

    assert captured["reply_length"] == "detailed"


def test_brief_directive_asks_for_fewer_sentences_than_the_code_cap():
    # Talimat kod tavanının altında: tavan yalnızca güvenlik ağı kalmalı.
    assert "3" in reply_length_directive("brief", "tr")
    assert orchestrator_module.MAX_REPLY_SENTENCES_BRIEF > 3
    assert "8" in reply_length_directive("medium", "tr")
    assert orchestrator_module.MAX_REPLY_SENTENCES_MEDIUM > 8
