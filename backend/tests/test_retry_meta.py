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
