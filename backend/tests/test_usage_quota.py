"""Günlük sohbet/fotoğraf kotası (bkz. app/services/usage_quota_service.py)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db.base import Base
from app.models.rate_limit_attempt import RateLimitAttempt
from app.models.user import User
from app.services import usage_quota_service
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    yield session
    session.close()


def _register_and_login(client, email, password="supersecret"):
    client.post(
        "/auth/register",
        json={"email": email, "password": password, "kvkk_consent": True, "health_data_consent": True, "terms_consent": True},
    )
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _fake_orchestrator(monkeypatch):
    from app import chat_router

    monkeypatch.setattr(chat_router, "run_orchestrator", lambda db, user_id, message: ("ok", "orchestrator"))


def test_local_day_starts_at_user_midnight_not_utc():
    # 2026-09-30 01:30 İstanbul = 29 Eylül 22:30 UTC: gün İstanbul'da çoktan başladı.
    now = datetime(2026, 9, 29, 22, 30, tzinfo=timezone.utc)
    start, end = usage_quota_service._local_day_bounds_utc("Europe/Istanbul", now)
    assert start == datetime(2026, 9, 29, 21, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 30, 21, 0, tzinfo=timezone.utc)

    utc_start, _ = usage_quota_service._local_day_bounds_utc(None, now)
    assert utc_start == datetime(2026, 9, 29, 0, 0, tzinfo=timezone.utc)


def test_attempts_before_local_midnight_do_not_count(db_session):
    user = User(email="quota-day@example.com", hashed_password="x", timezone="Europe/Istanbul")
    db_session.add(user)
    now = datetime(2026, 9, 29, 22, 30, tzinfo=timezone.utc)  # İstanbul 30 Eylül 01:30
    for created_at in (
        datetime(2026, 9, 29, 20, 59),  # İstanbul 29 Eylül 23:59 - dün
        datetime(2026, 9, 29, 21, 1),  # İstanbul 30 Eylül 00:01 - bugün
        datetime(2026, 9, 29, 22, 0),
    ):
        db_session.add(RateLimitAttempt(bucket="chat", identifier=user.email, created_at=created_at))
    db_session.add(RateLimitAttempt(bucket="photo_analyze", identifier=user.email, created_at=datetime(2026, 9, 29, 22, 0)))
    db_session.commit()

    usage = usage_quota_service.daily_usage(db_session, user, usage_quota_service.CHAT_BUCKET, now=now)
    assert usage.used == 2
    assert usage.resets_at == datetime(2026, 9, 30, 21, 0, tzinfo=timezone.utc)


def test_chat_blocked_after_daily_limit_with_localized_message(client, monkeypatch):
    _fake_orchestrator(monkeypatch)
    monkeypatch.setattr(get_settings(), "chat_daily_limit", 2)
    headers = _register_and_login(client, "quota-chat@example.com")

    for _ in range(2):
        assert client.post("/chat", json={"message": "merhaba"}, headers=headers).status_code == 200

    blocked = client.post("/chat", json={"message": "merhaba"}, headers=headers)
    assert blocked.status_code == 429
    assert "Bugünkü 2 mesaj hakkını kullandın" in blocked.json()["detail"]
    # Akış endpoint'i de aynı sayacı kullanır.
    assert client.post("/chat/stream", json={"message": "merhaba"}, headers=headers).status_code == 429

    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    blocked_en = client.post("/chat", json={"message": "hello"}, headers=headers)
    assert blocked_en.status_code == 429
    assert "today's 2 messages" in blocked_en.json()["detail"]


def test_rejected_calls_do_not_consume_quota(client, monkeypatch):
    """Kota dolunca reddedilen istek sayaca yazılmaz - aksi halde hak dolu
    kullanıcının her denemesi ertesi günü de etkilemezdi ama sayı şişerdi."""
    _fake_orchestrator(monkeypatch)
    monkeypatch.setattr(get_settings(), "chat_daily_limit", 1)
    headers = _register_and_login(client, "quota-noconsume@example.com")

    client.post("/chat", json={"message": "merhaba"}, headers=headers)
    for _ in range(3):
        assert client.post("/chat", json={"message": "merhaba"}, headers=headers).status_code == 429

    body = client.get("/users/me/usage", headers=headers).json()
    assert body["chat"] == {"used": 1, "limit": 1, "remaining": 0}


def test_zero_limit_disables_quota(client, monkeypatch):
    _fake_orchestrator(monkeypatch)
    monkeypatch.setattr(get_settings(), "chat_daily_limit", 0)
    headers = _register_and_login(client, "quota-off@example.com")

    for _ in range(3):
        assert client.post("/chat", json={"message": "merhaba"}, headers=headers).status_code == 200
    body = client.get("/users/me/usage", headers=headers).json()
    assert body["chat"] == {"used": 3, "limit": None, "remaining": None}


def test_photo_quota_is_separate_from_chat(client, monkeypatch):
    _fake_orchestrator(monkeypatch)
    monkeypatch.setattr(get_settings(), "photo_daily_limit", 1)
    monkeypatch.setattr(get_settings(), "chat_daily_limit", 5)
    headers = _register_and_login(client, "quota-photo@example.com")

    # Desteklenmeyen dosya da bir analiz denemesi sayılır (her çağrı sayılıyor).
    pdf = {"file": ("meal.pdf", b"not-an-image", "application/pdf")}
    assert client.post("/nutrition/photo-analyze", files=pdf, headers=headers).status_code == 422
    blocked = client.post("/nutrition/photo-analyze", files=pdf, headers=headers)
    assert blocked.status_code == 429
    assert "fotoğraf analizi" in blocked.json()["detail"]

    assert client.post("/chat", json={"message": "merhaba"}, headers=headers).status_code == 200


def test_usage_endpoint_reports_remaining_and_local_reset(client, monkeypatch):
    _fake_orchestrator(monkeypatch)
    monkeypatch.setattr(get_settings(), "chat_daily_limit", 10)
    monkeypatch.setattr(get_settings(), "photo_daily_limit", 3)
    headers = {**_register_and_login(client, "quota-usage@example.com"), "X-Timezone": "Europe/Istanbul"}

    client.post("/chat", json={"message": "merhaba"}, headers=headers)
    body = client.get("/users/me/usage", headers=headers).json()

    assert body["chat"] == {"used": 1, "limit": 10, "remaining": 9}
    assert body["photo"] == {"used": 0, "limit": 3, "remaining": 3}
    resets_at = datetime.fromisoformat(body["resets_at"].replace("Z", "+00:00"))
    assert resets_at.astimezone(timezone(timedelta(hours=3))).time().hour == 0
    assert resets_at > datetime.now(timezone.utc)


def test_usage_requires_authentication(client):
    assert client.get("/users/me/usage").status_code == 401
