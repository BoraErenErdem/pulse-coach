from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile
from app.scheduler.jobs import weekly_summary_job
from app.services import progress_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="progress@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_log_progress_saves_entry(db_session):
    session, user_id = db_session
    entry = progress_service.log_progress(
        session, user_id, weight=78.5, workout_completed=True, workout_type="kuvvet"
    )
    assert entry.id is not None
    assert entry.weight == 78.5
    assert entry.workout_type == "kuvvet"


def test_log_progress_rejects_invalid_workout_type(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        progress_service.log_progress(session, user_id, workout_completed=True, workout_type="yüzme")


def test_log_progress_clears_workout_type_when_not_completed(db_session):
    session, user_id = db_session
    entry = progress_service.log_progress(
        session, user_id, workout_completed=False, workout_type="kuvvet"
    )
    assert entry.workout_type is None


def test_generate_weekly_summary_counts_recent_entries(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, workout_completed=True, workout_type="kardiyo",
        log_date=date.today() - timedelta(days=2),
    )
    progress_service.log_progress(
        session, user_id, weight=79, workout_completed=True, workout_type="kuvvet",
        log_date=date.today() - timedelta(days=1),
    )
    progress_service.log_progress(
        session, user_id, weight=85, workout_completed=True, workout_type="kuvvet",
        log_date=date.today() - timedelta(days=30),
    )

    summary = progress_service.generate_weekly_summary(session, user_id)

    assert summary.log_count == 2
    assert summary.workout_count == 2
    assert summary.workout_types == {"kardiyo": 1, "kuvvet": 1}
    assert summary.weight_start == 80
    assert summary.weight_end == 79
    assert summary.weight_trend == -1


def test_list_progress_logs_orders_by_date_ascending(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=79, log_date=date.today() - timedelta(days=1)
    )
    progress_service.log_progress(
        session, user_id, weight=80, log_date=date.today() - timedelta(days=5)
    )

    logs = progress_service.list_progress_logs(session, user_id)

    assert [log.weight for log in logs] == [80, 79]


def test_list_progress_logs_filters_by_days(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=79, log_date=date.today() - timedelta(days=1)
    )

    logs = progress_service.list_progress_logs(session, user_id, days=7)

    assert [log.weight for log in logs] == [79]


def test_generate_weekly_summary_empty_when_no_logs(db_session):
    session, user_id = db_session
    summary = progress_service.generate_weekly_summary(session, user_id)
    assert summary.log_count == 0
    assert "girilmemiş" in summary.as_text()


@pytest.mark.integration
def test_weekly_summary_job_creates_checkin_messages(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    progress_service.log_progress(session, user_id, weight=70, workout_completed=True, workout_type="kuvvet")

    created = weekly_summary_job(session)

    assert len(created) == 1
    assert created[0].user_id == user_id
    assert created[0].message.strip() != ""


def _register_and_login(client, email="progress-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_log_progress_endpoint(client):
    headers = _register_and_login(client, email="progress-api-log@example.com")
    response = client.post(
        "/progress/log",
        json={"weight": 77.2, "workout_completed": True, "workout_type": "kardiyo"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["weight"] == 77.2
    assert body["workout_type"] == "kardiyo"


def test_log_progress_endpoint_rejects_invalid_workout_type(client):
    headers = _register_and_login(client, email="progress-api-invalid@example.com")
    response = client.post(
        "/progress/log",
        json={"workout_completed": True, "workout_type": "yüzme"},
        headers=headers,
    )
    assert response.status_code == 422


def test_weekly_summary_endpoint(client):
    headers = _register_and_login(client, email="progress-api-summary@example.com")
    client.post(
        "/progress/log",
        json={"weight": 70, "workout_completed": True, "workout_type": "esneklik"},
        headers=headers,
    )

    response = client.get("/progress/weekly-summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["log_count"] == 1
    assert body["workout_count"] == 1
    assert body["summary_text"].strip() != ""


def test_list_logs_endpoint_returns_entries_in_date_order(client):
    headers = _register_and_login(client, email="progress-api-logs@example.com")
    client.post(
        "/progress/log",
        json={"weight": 80, "workout_completed": True, "workout_type": "kuvvet"},
        headers=headers,
    )
    client.post(
        "/progress/log",
        json={"weight": 79.5, "workout_completed": False},
        headers=headers,
    )

    response = client.get("/progress/logs", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["log_date"] <= body[1]["log_date"]


def test_list_logs_endpoint_filters_by_days(client):
    headers = _register_and_login(client, email="progress-api-logs-days@example.com")
    client.post("/progress/log", json={"weight": 80}, headers=headers)

    response = client.get("/progress/logs", params={"days": 1}, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_progress_requires_authentication(client):
    response = client.get("/progress/weekly-summary")
    assert response.status_code == 401


@pytest.mark.integration
def test_chat_logs_progress_via_tool_call(client):
    headers = _register_and_login(client, email="progress-chat@example.com")
    response = client.post(
        "/chat",
        json={"message": "Bugün 78 kilo geldim, antrenman da yaptım, kuvvet çalıştım."},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "tracking_agent" in body["agent_used"]

    summary_response = client.get("/progress/weekly-summary", headers=headers)
    assert summary_response.json()["log_count"] == 1


@pytest.mark.integration
def test_chat_weekly_summary_via_tool_call(client):
    headers = _register_and_login(client, email="progress-chat-summary@example.com")
    client.post(
        "/progress/log",
        json={"weight": 70, "workout_completed": True, "workout_type": "kardiyo"},
        headers=headers,
    )

    response = client.post("/chat", json={"message": "Bu haftam nasıl geçmiş?"}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "tracking_agent" in body["agent_used"]
