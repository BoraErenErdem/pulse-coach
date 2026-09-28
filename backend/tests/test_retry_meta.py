"""Yeniden deneme notuna verilen "Haklısın, özür dilerim" açılışları kullanıcıya
gitmemeli (2026-09-27 canlı test)."""

import pytest

from app.agents.orchestrator import _strip_retry_meta


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (
            "Haklısın, özür dilerim! 😅 Sana bir özet vermeyi unuttum. 😅\n\nİşte kaydedilenler: kilo 83.6.",
            "İşte kaydedilenler: kilo 83.6.",
        ),
        ("Harika bir hatırlatma! Haklısın. Squat setlerini kaydettim.", "Squat setlerini kaydettim."),
        ("You're right, sorry! I logged 3 sets.", "I logged 3 sets."),
        # Normal yanıtlar değişmez
        ("Bugün hem kilonu hem yürüyüşünü kaydettim! 💪 Harika.", "Bugün hem kilonu hem yürüyüşünü kaydettim! 💪 Harika."),
        # Yalnız meta cümlesi varsa yanıt boşa düşmez
        ("Özür dilerim.", "Özür dilerim."),
    ],
)
def test_strip_retry_meta(reply, expected):
    assert _strip_retry_meta(reply) == expected


def test_suspicious_value_question_appended_only_when_missing():
    from langchain_core.messages import ToolMessage

    from app.agents.orchestrator import _ensure_suspicious_value_question

    note = ToolMessage(
        content="ŞÜPHELİ DEĞER: Squat (Çömelme) 900 kg. Yazım hatası olabilir: kutlama ve rekor deme. Kaydedildi: ...",
        tool_call_id="1",
        name="log_exercise_set",
    )
    reply = "Squat setini kaydettim, harika!"
    fixed = _ensure_suspicious_value_question(reply, [note], "tr")
    assert fixed.startswith(reply) and "900 kg gerçek dışı görünüyor - doğru mu?" in fixed
    # Soru zaten varsa ya da not yoksa dokunulmaz.
    assert _ensure_suspicious_value_question("900 kg doğru mu?", [note], "tr") == "900 kg doğru mu?"
    assert _ensure_suspicious_value_question(reply, [], "tr") == reply
