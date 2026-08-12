import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.checkin_message import CheckinMessage


@pytest.fixture()
def client_with_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()


def _register_and_login(client, email, password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_checkins_requires_authentication(client):
    response = client.get("/checkins")
    assert response.status_code == 401


def test_list_checkins_returns_own_messages_and_marks_delivered(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-a@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="Bu hafta harika gidiyorsun!"))
    session.commit()
    session.close()

    first_response = client.get("/checkins", headers=headers)
    assert first_response.status_code == 200
    body = first_response.json()
    assert len(body) == 1
    assert body[0]["message"] == "Bu hafta harika gidiyorsun!"
    assert body[0]["delivered"] is False

    second_response = client.get("/checkins", headers=headers)
    assert second_response.json()[0]["delivered"] is True


def test_list_checkins_includes_kind(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-kind@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="Günlük hatırlatma", kind="daily_nudge"))
    session.commit()
    session.close()

    body = client.get("/checkins", headers=headers).json()
    assert body[0]["kind"] == "daily_nudge"


def test_unread_count_returns_correct_count(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-unread@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="1"))
    session.add(CheckinMessage(user_id=user_id, message="2"))
    session.commit()
    session.close()

    response = client.get("/checkins/unread-count", headers=headers)
    assert response.status_code == 200
    assert response.json()["count"] == 2


def test_unread_count_does_not_mark_delivered(client_with_session):
    """Asıl gerekçe olan regresyonun testi: list_checkins'in AKSİNE,
    unread-count'u çağırmak hiçbir satırı delivered=True yapmamalı - aksi
    halde badge'i render etmek bile Bildirimler ekranı hiç açılmadan
    "okunmamış" durumunu sessizce sıfırlardı."""
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-unread-no-mutate@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="1"))
    session.commit()
    session.close()

    client.get("/checkins/unread-count", headers=headers)
    client.get("/checkins/unread-count", headers=headers)

    # unread-count'u kaç kez çağırırsak çağıralım hâlâ 1 dönmeli.
    response = client.get("/checkins/unread-count", headers=headers)
    assert response.json()["count"] == 1

    # list_checkins hâlâ "Yeni" (delivered=False) görmeli - unread-count
    # tarafından işaretlenmemiş olmalı.
    body = client.get("/checkins", headers=headers).json()
    assert body[0]["delivered"] is False


def test_checkins_isolated_between_users(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers_a = _register_and_login(client, "checkin-b@example.com")
    headers_b = _register_and_login(client, "checkin-c@example.com")
    user_a_id = client.get("/users/me", headers=headers_a).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_a_id, message="Sadece A için mesaj"))
    session.commit()
    session.close()

    assert len(client.get("/checkins", headers=headers_a).json()) == 1
    assert len(client.get("/checkins", headers=headers_b).json()) == 0
