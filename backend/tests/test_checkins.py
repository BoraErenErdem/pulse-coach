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
