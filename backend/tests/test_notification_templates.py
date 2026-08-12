import pytest

from app.content import notification_templates as nt

LANGUAGES = ["tr", "en"]
TONES = ["sicak", "enerjik", "notr"]
CHECKIN_KINDS = ["weekly_summary", "daily_nudge"]


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("tone", TONES)
def test_render_pr_notification_returns_nonempty_pool_member(language, tone):
    title, body = nt.render_pr_notification(language, tone, "Squat", 100.0)
    assert title.strip() != ""
    assert body.strip() != ""
    pool = nt.PR_TEMPLATES[language][tone]
    assert any(title == t.format(exercise="Squat", weight="100") for t, _ in pool)


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("tone", TONES)
def test_render_goal_notification_returns_nonempty_pool_member(language, tone):
    title, body = nt.render_goal_notification(language, tone, "Squat", 100.0)
    assert title.strip() != ""
    assert body.strip() != ""
    pool = nt.GOAL_TEMPLATES[language][tone]
    assert any(title == t.format(exercise="Squat", target="100") for t, _ in pool)


@pytest.mark.parametrize("language", LANGUAGES)
@pytest.mark.parametrize("kind", CHECKIN_KINDS)
def test_render_checkin_notification_title_returns_pool_member(language, kind):
    title = nt.render_checkin_notification_title(language, kind)
    assert title in nt.CHECKIN_LOCKSCREEN_TITLES[language][kind]


def test_render_pr_notification_falls_back_to_notr_for_unknown_tone():
    title, _ = nt.render_pr_notification("tr", "bilinmeyen-ton", "Squat", 100.0)
    pool = nt.PR_TEMPLATES["tr"]["notr"]
    assert any(title == t.format(exercise="Squat", weight="100") for t, _ in pool)


def test_render_checkin_notification_title_falls_back_to_tr_for_unknown_language():
    title = nt.render_checkin_notification_title("fr", "weekly_summary")
    assert title in nt.CHECKIN_LOCKSCREEN_TITLES["tr"]["weekly_summary"]


def test_pr_and_goal_notification_never_leak_into_checkin_pool():
    """Gizlilik regresyonu: check-in başlıkları jenerik havuzdan gelmeli,
    PR/hedef havuzlarından bir string sızmamalı (farklı bir liste - kod
    hatasıyla yanlış sözlük referanslanmadığını doğrular)."""
    assert nt.CHECKIN_LOCKSCREEN_TITLES is not nt.PR_TEMPLATES
    assert nt.CHECKIN_LOCKSCREEN_TITLES is not nt.GOAL_TEMPLATES
