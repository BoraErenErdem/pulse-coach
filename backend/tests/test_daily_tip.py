from datetime import date, timedelta

from app.content.daily_tips import DAILY_TIPS, get_daily_tip


def test_get_daily_tip_is_deterministic_for_same_date():
    d = date(2026, 3, 5)
    assert get_daily_tip(d) == get_daily_tip(d)


def test_get_daily_tip_changes_across_dates_within_pool_size():
    d = date(2026, 1, 1)
    tips_seen = {get_daily_tip(d + timedelta(days=offset)) for offset in range(len(DAILY_TIPS))}
    # havuzdaki tüm ipuçları en az bir kez görülmeli (döngü tam bir tur atınca)
    assert tips_seen == set(DAILY_TIPS)


def test_get_daily_tip_repeats_after_full_cycle():
    d = date(2026, 1, 1)
    later = d + timedelta(days=len(DAILY_TIPS))
    assert get_daily_tip(d) == get_daily_tip(later)


def test_get_daily_tip_defaults_to_today_when_no_date_given():
    assert get_daily_tip() in DAILY_TIPS


def _register_and_login(client, email="dailytip@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_daily_tip_endpoint_returns_tip_and_date(client):
    headers = _register_and_login(client)
    response = client.get("/daily-tip", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["tip"] in DAILY_TIPS
    assert body["date"] == date.today().isoformat()


def test_daily_tip_endpoint_requires_authentication(client):
    response = client.get("/daily-tip")
    assert response.status_code == 401


def test_daily_tip_endpoint_is_same_for_all_users_on_same_day(client):
    headers_a = _register_and_login(client, email="dailytip-a@example.com")
    headers_b = _register_and_login(client, email="dailytip-b@example.com")

    tip_a = client.get("/daily-tip", headers=headers_a).json()["tip"]
    tip_b = client.get("/daily-tip", headers=headers_b).json()["tip"]

    assert tip_a == tip_b
