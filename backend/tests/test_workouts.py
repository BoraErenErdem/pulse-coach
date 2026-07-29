from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.exercise_catalog import ExerciseCatalog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.services import workout_service
from app.services.workout_service import SetInput


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="workout@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_log_workout_session_saves_sets_with_auto_numbering(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session,
        user_id,
        workout_type="kuvvet",
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
            SetInput(exercise_name="Bench Press", reps=10, weight_kg=40),
        ],
    )

    assert result.id is not None
    assert len(result.sets) == 3
    squat_sets = [s for s in result.sets if s.exercise_name_snapshot == "Squat"]
    assert [s.set_number for s in squat_sets] == [1, 2]


def test_log_workout_session_rejects_invalid_workout_type(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        workout_service.log_workout_session(
            session, user_id, workout_type="yüzme", sets=[SetInput(exercise_name="Squat", reps=10)]
        )


def test_log_workout_session_rejects_empty_sets(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        workout_service.log_workout_session(session, user_id, sets=[])


def test_log_workout_session_syncs_progress_log(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        workout_type="kardiyo",
        session_date=date.today(),
        sets=[SetInput(exercise_name="Koşu bandı", reps=1)],
    )

    logs = session.query(ProgressLog).filter(ProgressLog.user_id == user_id).all()
    assert len(logs) == 1
    assert logs[0].workout_completed is True
    assert logs[0].workout_type == "kardiyo"


def test_generate_workout_summary_computes_volume_and_breakdown(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
        ],
    )

    summary = workout_service.generate_workout_summary(session, user_id, days=7)

    assert summary.session_count == 1
    assert summary.total_sets == 2
    assert summary.total_volume_kg == 10 * 60 + 8 * 65
    assert summary.sets_by_exercise == {"Squat": 2}


def test_generate_workout_summary_empty_when_no_sessions(db_session):
    session, user_id = db_session
    summary = workout_service.generate_workout_summary(session, user_id)
    assert summary.session_count == 0
    assert "girilmemiş" in summary.as_text()


def test_list_workout_sessions_filters_by_days(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        session_date=date.today() - timedelta(days=30),
        sets=[SetInput(exercise_name="Squat", reps=10)],
    )
    workout_service.log_workout_session(
        session,
        user_id,
        session_date=date.today() - timedelta(days=1),
        sets=[SetInput(exercise_name="Bench Press", reps=10)],
    )

    sessions = workout_service.list_workout_sessions(session, user_id, days=7)
    assert len(sessions) == 1
    assert sessions[0].sets[0].exercise_name_snapshot == "Bench Press"


def _register_and_login(client, email="workout-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_log_session_endpoint(client):
    headers = _register_and_login(client, email="workout-api-log@example.com")
    response = client.post(
        "/workouts/sessions",
        json={
            "workout_type": "kuvvet",
            "sets": [
                {"exercise_name": "Squat", "reps": 10, "weight_kg": 60},
                {"exercise_name": "Squat", "reps": 8, "weight_kg": 65},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["sets"]) == 2
    assert body["sets"][0]["set_number"] == 1
    assert body["sets"][1]["set_number"] == 2


def test_log_session_endpoint_rejects_empty_sets(client):
    headers = _register_and_login(client, email="workout-api-empty@example.com")
    response = client.post(
        "/workouts/sessions", json={"workout_type": "kuvvet", "sets": []}, headers=headers
    )
    assert response.status_code == 422


def test_list_sessions_endpoint(client):
    headers = _register_and_login(client, email="workout-api-list@example.com")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10}]},
        headers=headers,
    )

    response = client.get("/workouts/sessions", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_summary_endpoint(client):
    headers = _register_and_login(client, email="workout-api-summary@example.com")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]},
        headers=headers,
    )

    response = client.get("/workouts/summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["session_count"] == 1
    assert body["summary_text"].strip() != ""


def test_workouts_requires_authentication(client):
    response = client.get("/workouts/summary")
    assert response.status_code == 401


@pytest.mark.integration
def test_chat_logs_exercise_set_via_tool_call(client):
    headers = _register_and_login(client, email="workout-chat@example.com")
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    db.add(
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/chat", json={"message": "Squat yaptım, 10 tekrar, 60 kilo kaldırdım."}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert "workout_tracking_agent" in body["agent_used"]

    summary_response = client.get("/workouts/summary", headers=headers)
    assert summary_response.json()["total_sets"] >= 1
