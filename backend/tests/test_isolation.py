import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.conversation import Conversation


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


def test_progress_logs_isolated_between_users(client):
    headers_a = _register_and_login(client, "isolation-a@example.com")
    headers_b = _register_and_login(client, "isolation-b@example.com")

    client.post(
        "/progress/log",
        json={"weight": 80, "workout_completed": True, "workout_type": "kuvvet"},
        headers=headers_a,
    )

    logs_a = client.get("/progress/logs", headers=headers_a).json()
    logs_b = client.get("/progress/logs", headers=headers_b).json()
    assert len(logs_a) == 1
    assert len(logs_b) == 0

    summary_a = client.get("/progress/weekly-summary", headers=headers_a).json()
    summary_b = client.get("/progress/weekly-summary", headers=headers_b).json()
    assert summary_a["log_count"] == 1
    assert summary_b["log_count"] == 0


def test_chat_history_isolated_between_users(client_with_session):
    client, TestingSessionLocal = client_with_session
    headers_a = _register_and_login(client, "isolation-chat-a@example.com")
    headers_b = _register_and_login(client, "isolation-chat-b@example.com")

    user_a_id = client.get("/users/me", headers=headers_a).json()["id"]

    session = TestingSessionLocal()
    session.add(Conversation(user_id=user_a_id, role="user", content="Sadece A kullanıcısının mesajı"))
    session.commit()
    session.close()

    history_a = client.get("/chat/history", headers=headers_a).json()
    history_b = client.get("/chat/history", headers=headers_b).json()
    assert len(history_a) == 1
    assert history_a[0]["content"] == "Sadece A kullanıcısının mesajı"
    assert len(history_b) == 0
