import pytest

from app.content import notification_templates as nt

LANGUAGES = ["tr", "en"]
TONES = ["sicak", "enerjik", "notr"]
CHECKIN_KINDS = ["weekly_summary", "daily_nudge"]


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("tone", TONES)
def test_render_pr_notification_returns_nonempty_pool_member(language, tone):
    title, body = nt.render_pr_notification(language, tone)
    assert title.strip() != ""
    assert body.strip() != ""
    assert (title, body) in nt.PR_TEMPLATES[language][tone]


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("tone", TONES)
def test_render_goal_notification_returns_nonempty_pool_member(language, tone):
    title, body = nt.render_goal_notification(language, tone)
    assert title.strip() != ""
    assert body.strip() != ""
    assert (title, body) in nt.GOAL_TEMPLATES[language][tone]


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("kind", CHECKIN_KINDS)
def test_render_checkin_notification_title_returns_pool_member(language, kind):
    title = nt.render_checkin_notification_title(language, kind)
    assert title in nt.CHECKIN_LOCKSCREEN_TITLES[language][kind]


def test_render_pr_notification_falls_back_to_notr_for_unknown_tone():
    assert nt.render_pr_notification("tr", "bilinmeyen-ton") in nt.PR_TEMPLATES["tr"]["notr"]


def test_render_checkin_notification_title_falls_back_to_tr_for_unknown_language():
    title = nt.render_checkin_notification_title("fr", "weekly_summary")
    assert title in nt.CHECKIN_LOCKSCREEN_TITLES["tr"]["weekly_summary"]


def test_pr_and_goal_notification_never_leak_into_checkin_pool():
    """Gizlilik regresyonu: check-in başlıkları jenerik havuzdan gelmeli,
    PR/hedef havuzlarından bir string sızmamalı (farklı bir liste - kod
    hatasıyla yanlış sözlük referanslanmadığını doğrular)."""
    assert nt.CHECKIN_LOCKSCREEN_TITLES is not nt.PR_TEMPLATES
    assert nt.CHECKIN_LOCKSCREEN_TITLES is not nt.GOAL_TEMPLATES


def test_push_templates_carry_no_personal_data():
    """KVKK (2026-10-05): push metni Expo/Apple üzerinden yurt dışına gidiyor -
    şablonlarda egzersiz adı/ağırlık gibi yer tutucu kalmamalı."""
    for pool in (nt.PR_TEMPLATES, nt.GOAL_TEMPLATES):
        for by_tone in pool.values():
            for variants in by_tone.values():
                for title, body in variants:
                    assert "{" not in title + body
                    assert "kg" not in title + body
