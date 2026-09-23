"""Haftalık antrenman günü hedefi (2026-09-23) - bkz. weekly_goal_service."""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.profile_agent import build_profile_tools
from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.db.base import Base
from app.models.user import User
from app.services import profile_service, progress_service, weekly_goal_service, workout_service
from app.services.workout_service import SetInput

# 2026-09-23 bir Çarşamba - hafta 21 Eylül Pazartesi'de başlar.
WEDNESDAY = date(2026, 9, 23)


@pytest.fixture()
def db_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    user = User(email="weekly@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    monkeypatch.setattr(weekly_goal_service, "user_today", lambda db, user_id: WEDNESDAY)
    try:
        yield session, user.id
    finally:
        session.close()


def _log_session_on(session, user_id, day):
    workout_service.log_workout_session(
        session, user_id, session_date=day, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )


def test_progress_counts_distinct_days_in_local_week_only(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, weekly_workout_goal_days=3)
    monday = date(2026, 9, 21)
    _log_session_on(session, user_id, monday)
    _log_session_on(session, user_id, monday)  # aynı gün 2. oturum - 1 gün sayılır
    _log_session_on(session, user_id, monday - timedelta(days=1))  # geçen haftanın Pazar'ı - sayılmaz
    progress_service.log_progress(session, user_id, workout_completed=True, log_date=WEDNESDAY)

    progress = weekly_goal_service.get_weekly_goal_progress(session, user_id)

    assert progress.week_start == monday
    assert progress.goal_days == 3
    assert progress.done_days == 2
    assert not progress.achieved
    assert [d.trained for d in progress.days] == [True, False, True, False, False, False, False]
    assert "2/3" in progress.as_text()


def test_goal_achieved(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, weekly_workout_goal_days=1)
    _log_session_on(session, user_id, WEDNESDAY)
    progress = weekly_goal_service.get_weekly_goal_progress(session, user_id)
    assert progress.achieved
    assert "TAMAMLANDI" in progress.as_text()


@pytest.mark.parametrize("value", [0, 8, -1])
def test_goal_out_of_range_is_rejected(db_session, value):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, weekly_workout_goal_days=value)


def test_coach_can_set_goal_and_sees_progress_after_logging(db_session):
    session, user_id = db_session
    profile_tool = next(t for t in build_profile_tools(session, user_id) if t.name == "update_user_profile")
    profile_tool.invoke({"weekly_workout_goal_days": 4})
    assert profile_service.get_profile(session, user_id).weekly_workout_goal_days == 4

    workout_tools = {t.name: t for t in build_workout_tracking_tools(session, user_id)}
    result = workout_tools["log_exercise_set"].invoke({"exercise_name": "Squat", "reps": 10, "weight_kg": 60})
    assert "Haftalık hedef" in result


def _auth(client, email="weekly-api@example.com"):
    client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "supersecret",
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_weekly_goal_api_set_read_and_clear(client):
    headers = _auth(client)
    assert client.get("/workouts/weekly-goal", headers=headers).json()["goal_days"] is None

    assert client.patch("/profile", json={"weekly_workout_goal_days": 4}, headers=headers).status_code == 200
    client.post("/workouts/sessions", json={"sets": [{"exercise_name": "Squat", "reps": 5, "weight_kg": 60}]}, headers=headers)
    body = client.get("/workouts/weekly-goal", headers=headers).json()
    assert body["goal_days"] == 4
    assert body["done_days"] == 1
    assert len(body["days"]) == 7
    assert body["achieved"] is False

    assert client.patch("/profile", json={"weekly_workout_goal_days": 9}, headers=headers).status_code == 422
    client.patch("/profile", json={"weekly_workout_goal_days": None}, headers=headers)
    assert client.get("/profile", headers=headers).json()["weekly_workout_goal_days"] is None
