from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User
from app.services import push_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="push@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user
    finally:
        session.close()


def test_set_push_token_saves_and_clears(db_session):
    session, user = db_session
    push_service.set_push_token(session, user, "ExponentPushToken[abc123]")
    session.refresh(user)
    assert user.expo_push_token == "ExponentPushToken[abc123]"

    push_service.set_push_token(session, user, None)
    session.refresh(user)
    assert user.expo_push_token is None


def test_send_push_notification_no_token_is_noop(db_session, monkeypatch):
    session, user = db_session
    called = {"post": False}
    monkeypatch.setattr(
        push_service.requests, "post", lambda *a, **k: called.update(post=True)
    )

    push_service.send_push_notification(session, user, "title", "body")

    assert called["post"] is False


def test_send_push_notification_success_posts_expected_payload(db_session, monkeypatch):
    session, user = db_session
    user.expo_push_token = "ExponentPushToken[abc123]"
    session.commit()
    captured: dict = {}

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"data": {"status": "ok"}},
        )

    monkeypatch.setattr(push_service.requests, "post", fake_post)

    push_service.send_push_notification(
        session, user, "Başlık", "Gövde", data={"type": "pr"}
    )

    assert captured["url"] == push_service.EXPO_PUSH_URL
    assert captured["json"]["to"] == "ExponentPushToken[abc123]"
    assert captured["json"]["title"] == "Başlık"
    assert captured["json"]["body"] == "Gövde"
    assert captured["json"]["data"] == {"type": "pr"}


def test_send_push_notification_device_not_registered_clears_token(db_session, monkeypatch):
    session, user = db_session
    user.expo_push_token = "ExponentPushToken[stale]"
    session.commit()

    def fake_post(*a, **k):
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "data": {"status": "error", "message": "...", "details": {"error": "DeviceNotRegistered"}}
            },
        )

    monkeypatch.setattr(push_service.requests, "post", fake_post)

    push_service.send_push_notification(session, user, "title", "body")

    session.refresh(user)
    assert user.expo_push_token is None


def test_send_push_notification_swallows_network_exception(db_session, monkeypatch):
    session, user = db_session
    user.expo_push_token = "ExponentPushToken[abc123]"
    session.commit()

    def fake_post(*a, **k):
        raise ConnectionError("boom")

    monkeypatch.setattr(push_service.requests, "post", fake_post)

    # Hiçbir exception dışarı sızmamalı.
    push_service.send_push_notification(session, user, "title", "body")

    session.refresh(user)
    # Ağ hatası token'ı temizlemez (sadece DeviceNotRegistered temizler).
    assert user.expo_push_token == "ExponentPushToken[abc123]"
