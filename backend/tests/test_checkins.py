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


def test_mark_all_checkins_read(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-mark-all@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="1"))
    session.add(CheckinMessage(user_id=user_id, message="2"))
    session.commit()
    session.close()

    response = client.post("/checkins/mark-all-read", headers=headers)
    assert response.status_code == 204

    # unread-count sıfır olmalı, list_checkins'in kendi örtük işaretleme
    # yan etkisine gerek kalmadan.
    assert client.get("/checkins/unread-count", headers=headers).json()["count"] == 0


def test_delete_checkin_endpoint(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-delete-one@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    checkin = CheckinMessage(user_id=user_id, message="silinecek")
    session.add(checkin)
    session.commit()
    session.refresh(checkin)
    checkin_id = checkin.id
    session.close()

    response = client.delete(f"/checkins/{checkin_id}", headers=headers)
    assert response.status_code == 204
    assert client.get("/checkins", headers=headers).json() == []


def test_delete_checkin_endpoint_not_found(client_with_session):
    client, _ = client_with_session
    headers = _register_and_login(client, "checkin-delete-404@example.com")
    response = client.delete("/checkins/999999", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Bildirim bulunamadı."


def test_delete_checkin_endpoint_respects_english_preference(client_with_session):
    client, _ = client_with_session
    headers = _register_and_login(client, "checkin-delete-404-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.delete("/checkins/999999", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Notification not found."


def test_delete_checkin_cannot_delete_other_users_message(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers_a = _register_and_login(client, "checkin-delete-owner-a@example.com")
    headers_b = _register_and_login(client, "checkin-delete-owner-b@example.com")
    user_a_id = client.get("/users/me", headers=headers_a).json()["id"]

    session = TestingSessionLocal()
    checkin = CheckinMessage(user_id=user_a_id, message="sadece A'nın")
    session.add(checkin)
    session.commit()
    session.refresh(checkin)
    checkin_id = checkin.id
    session.close()

    response = client.delete(f"/checkins/{checkin_id}", headers=headers_b)
    assert response.status_code == 404
    # A'nın mesajı hâlâ duruyor olmalı - B'nin isteği hiçbir şey silmemeli.
    assert len(client.get("/checkins", headers=headers_a).json()) == 1


def test_delete_all_checkins_endpoint(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers = _register_and_login(client, "checkin-delete-all@example.com")
    user_id = client.get("/users/me", headers=headers).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_id, message="1"))
    session.add(CheckinMessage(user_id=user_id, message="2"))
    session.commit()
    session.close()

    response = client.delete("/checkins", headers=headers)
    assert response.status_code == 204
    assert client.get("/checkins", headers=headers).json() == []


def test_delete_all_checkins_endpoint_empty_list_is_a_noop_success(client_with_session):
    client, _ = client_with_session
    headers = _register_and_login(client, "checkin-delete-all-empty@example.com")
    response = client.delete("/checkins", headers=headers)
    assert response.status_code == 204


def test_delete_all_checkins_only_affects_own_messages(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers_a = _register_and_login(client, "checkin-delete-all-owner-a@example.com")
    headers_b = _register_and_login(client, "checkin-delete-all-owner-b@example.com")
    user_a_id = client.get("/users/me", headers=headers_a).json()["id"]
    user_b_id = client.get("/users/me", headers=headers_b).json()["id"]

    session = TestingSessionLocal()
    session.add(CheckinMessage(user_id=user_a_id, message="A'nın"))
    session.add(CheckinMessage(user_id=user_b_id, message="B'nin"))
    session.commit()
    session.close()

    client.delete("/checkins", headers=headers_a)

    assert client.get("/checkins", headers=headers_a).json() == []
    assert len(client.get("/checkins", headers=headers_b).json()) == 1


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
