from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.services import achievement_service


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="achievements@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _meal(user_id: int, day: date, kcal: float) -> MealEntry:
    return MealEntry(
        user_id=user_id,
        food_name_snapshot="test",
        meal_type="ogle",
        quantity_grams=100,
        calories_kcal=kcal,
        protein_g=0,
        carbs_g=0,
        fat_g=0,
        log_date=day,
    )


def test_longest_run_counts_consecutive_days_only():
    start = date(2026, 9, 1)
    days = [start, start + timedelta(days=1), start + timedelta(days=2), start + timedelta(days=5), start + timedelta(days=6)]
    assert achievement_service._longest_run(days) == 3
    assert achievement_service._longest_run([]) == 0


def test_longest_streak_without_calorie_goal_uses_mood_days(db_session):
    session, user_id = db_session
    start = date(2026, 9, 1)
    for offset in (0, 1, 2, 3, 7):
        session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=start + timedelta(days=offset)))
    session.commit()

    assert achievement_service.longest_daily_streak(session, user_id) == 4


def test_longest_streak_with_calorie_goal_requires_calories_within_tolerance(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, daily_calorie_goal=2000))
    start = date(2026, 9, 1)
    for offset in range(4):
        session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=start + timedelta(days=offset)))
    # Gün 0-1 hedefte (±%20), gün 2 çok düşük -> seri kırılır, gün 3 hedefte.
    session.add(_meal(user_id, start, 1700))
    session.add(_meal(user_id, start + timedelta(days=1), 1000))
    session.add(_meal(user_id, start + timedelta(days=1), 1300))
    session.add(_meal(user_id, start + timedelta(days=2), 500))
    session.add(_meal(user_id, start + timedelta(days=3), 2100))
    session.commit()

    assert achievement_service.longest_daily_streak(session, user_id) == 2


def test_get_achievements_counts_distinct_days_and_badges(db_session):
    session, user_id = db_session
    start = date(2026, 9, 1)
    for offset in range(3):
        # Aynı güne iki oturum tek gün sayılır.
        session.add(WorkoutSession(user_id=user_id, session_date=start + timedelta(days=offset)))
        session.add(WorkoutSession(user_id=user_id, session_date=start + timedelta(days=offset)))
        session.add(MoodLog(user_id=user_id, mood_key="notr", log_date=start + timedelta(days=offset)))
    session.add(_meal(user_id, start, 500))
    session.add(_meal(user_id, start, 400))
    session.commit()

    result = achievement_service.get_achievements(session, user_id)
    assert result.workout_days == 3
    assert result.mood_days == 3
    assert result.meal_days == 1
    assert result.longest_streak == 3
    assert result.goals_reached == 0

    badges = {badge.key: badge for badge in result.badges}
    assert [badge.key for badge in result.badges] == [key for key, _, _ in achievement_service.BADGES]
    assert badges["first_workout"].earned is True
    assert badges["streak_3"].earned is True
    assert badges["streak_7"].earned is False
    assert badges["streak_7"].current == 3
    assert badges["workouts_10"].earned is False


def _register_and_login(client, email):
    client.post(
        "/auth/register",
        json={"email": email, "password": "supersecret", "kvkk_consent": True, "health_data_consent": True, "terms_consent": True},
    )
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_achievements_endpoint_requires_auth(client):
    assert client.get("/progress/achievements").status_code == 401


def test_achievements_endpoint_returns_badges_for_new_user(client):
    headers = _register_and_login(client, "achievements-api@example.com")
    body = client.get("/progress/achievements", headers=headers).json()
    assert body["workout_days"] == 0
    assert body["longest_streak"] == 0
    assert len(body["badges"]) == len(achievement_service.BADGES)
    assert all(badge["earned"] is False for badge in body["badges"])
