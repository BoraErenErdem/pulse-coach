"""Kullanıcının yerel takvim günü (2026-09-23) - bkz. app/services/user_time.py."""

from datetime import date, datetime, timezone

import pytest

from app.services import user_time


def _register_and_login(client, email="tz@example.com", password="supersecret"):
    client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_parse_timezone_accepts_iana_and_rejects_garbage():
    assert user_time.parse_timezone("Europe/Istanbul") is not None
    assert user_time.parse_timezone("Not/AZone") is None
    assert user_time.parse_timezone("../../etc/passwd") is None
    assert user_time.parse_timezone("x" * 200) is None
    assert user_time.parse_timezone(None) is None


def test_x_timezone_header_is_remembered_and_invalid_is_ignored(client):
    from app.db.session import get_db
    from app.main import app
    from app.models.user import User

    headers = _register_and_login(client)
    client.get("/users/me", headers={**headers, "X-Timezone": "Europe/Istanbul"})
    client.get("/users/me", headers={**headers, "X-Timezone": "Not/AZone"})

    db = next(app.dependency_overrides[get_db]())
    user = db.query(User).filter(User.email == "tz@example.com").one()
    assert user.timezone == "Europe/Istanbul"


def test_set_logged_after_local_midnight_goes_to_local_day(client, monkeypatch):
    # 2026-09-22 22:30 UTC = 2026-09-23 01:30 İstanbul - set yerel güne (23'ü)
    # yazılmalı; önceden UTC günü (22'si, yani "dün") kullanılıyordu.
    fixed_utc = datetime(2026, 9, 22, 22, 30, tzinfo=timezone.utc)

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_utc.astimezone(tz) if tz else fixed_utc.replace(tzinfo=None)

    monkeypatch.setattr(user_time, "datetime", _FrozenDatetime)

    headers = {**_register_and_login(client, email="tz-midnight@example.com"), "X-Timezone": "Europe/Istanbul"}
    response = client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["session_date"] == "2026-09-23"


@pytest.mark.parametrize("name,expected", [(None, date(2026, 9, 22)), ("Europe/Istanbul", date(2026, 9, 23))])
def test_local_today_falls_back_to_utc(monkeypatch, name, expected):
    fixed_utc = datetime(2026, 9, 22, 22, 30, tzinfo=timezone.utc)

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_utc.astimezone(tz)

    monkeypatch.setattr(user_time, "datetime", _FrozenDatetime)
    assert user_time.local_today(name) == expected
