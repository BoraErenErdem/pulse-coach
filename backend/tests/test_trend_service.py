from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.services import trend_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="trend@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def test_generate_weekly_trends_aggregates_this_weeks_data(db_session):
    session, user_id = db_session
    this_monday = _monday_of(date.today())

    session.add(MoodLog(user_id=user_id, mood_key="harika", log_date=this_monday))
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=this_monday + timedelta(days=1)))
    session.add(
        MealEntry(
            user_id=user_id,
            food_name_snapshot="Test besin",
            meal_type="öğle",
            quantity_grams=100,
            calories_kcal=300,
            protein_g=10,
            carbs_g=20,
            fat_g=5,
            log_date=this_monday,
        )
    )
    session.add(WorkoutSession(user_id=user_id, session_date=this_monday, workout_type="kuvvet"))
    session.add(ProgressLog(user_id=user_id, weight=79.5, log_date=this_monday))
    session.commit()

    points = trend_service.generate_weekly_trends(session, user_id, weeks=1)

    assert len(points) == 1
    point = points[0]
    assert point.week_start == this_monday
    assert point.mood_log_count == 2
    # "harika"=5, "iyi"=4 -> ortalama 4.5
    assert point.avg_mood_score == pytest.approx(4.5)
    assert point.workout_days == 1
    assert point.avg_daily_calories == pytest.approx(300.0)
    assert point.weight_end == pytest.approx(79.5)


def test_generate_weekly_trends_counts_progress_log_workout_completed_too(db_session):
    """Egzersiz iki ayrı yoldan kaydedilebiliyor: detaylı WorkoutSession
    (Antrenman sayfası) VE basit ProgressLog.workout_completed bayrağı
    (İlerleme sayfası) - antrenman günü ikisinin BİRLEŞİMİ olmalı."""
    session, user_id = db_session
    this_monday = _monday_of(date.today())

    session.add(WorkoutSession(user_id=user_id, session_date=this_monday, workout_type="kuvvet"))
    session.add(
        ProgressLog(user_id=user_id, workout_completed=True, workout_type="kardiyo", log_date=this_monday + timedelta(days=1))
    )
    # Aynı gün İKİ yoldan da işaretlenirse tek gün sayılmalı (set birleşimi).
    session.add(
        ProgressLog(user_id=user_id, workout_completed=True, workout_type="esneklik", log_date=this_monday)
    )
    session.commit()

    points = trend_service.generate_weekly_trends(session, user_id, weeks=1)

    assert points[0].workout_days == 2


def test_generate_weekly_trends_returns_none_fields_for_weeks_without_data(db_session):
    session, user_id = db_session
    points = trend_service.generate_weekly_trends(session, user_id, weeks=3)

    assert len(points) == 3
    for point in points:
        assert point.avg_mood_score is None
        assert point.mood_log_count == 0
        assert point.workout_days == 0
        assert point.avg_daily_calories is None
        assert point.weight_end is None


def test_generate_weekly_trends_separates_data_into_correct_weeks(db_session):
    session, user_id = db_session
    this_monday = _monday_of(date.today())
    last_monday = this_monday - timedelta(weeks=1)

    session.add(MoodLog(user_id=user_id, mood_key="zor", log_date=last_monday))
    session.add(MoodLog(user_id=user_id, mood_key="harika", log_date=this_monday))
    session.commit()

    points = trend_service.generate_weekly_trends(session, user_id, weeks=2)

    assert points[0].week_start == last_monday
    assert points[0].avg_mood_score == pytest.approx(1.0)
    assert points[1].week_start == this_monday
    assert points[1].avg_mood_score == pytest.approx(5.0)


def _make_point(workout_days: int, avg_mood_score: float | None) -> trend_service.WeeklyTrendPoint:
    return trend_service.WeeklyTrendPoint(
        week_start=date.today(),
        avg_mood_score=avg_mood_score,
        mood_log_count=1 if avg_mood_score is not None else 0,
        workout_days=workout_days,
        avg_daily_calories=None,
        weight_end=None,
    )


def test_mood_workout_correlation_returns_none_with_insufficient_weeks():
    points = [_make_point(3, 4.0), _make_point(0, 2.0), _make_point(2, 3.5)]
    assert trend_service.mood_workout_correlation(points) is None


def test_mood_workout_correlation_returns_none_when_no_variance():
    points = [_make_point(2, 4.0) for _ in range(5)]
    assert trend_service.mood_workout_correlation(points) is None


def test_mood_workout_correlation_detects_perfect_positive_relationship():
    points = [_make_point(0, 1.0), _make_point(1, 2.0), _make_point(2, 3.0), _make_point(3, 4.0)]
    correlation = trend_service.mood_workout_correlation(points)
    assert correlation == pytest.approx(1.0)


def test_mood_workout_correlation_detects_perfect_negative_relationship():
    points = [_make_point(0, 5.0), _make_point(1, 4.0), _make_point(2, 3.0), _make_point(3, 2.0)]
    correlation = trend_service.mood_workout_correlation(points)
    assert correlation == pytest.approx(-1.0)


def test_mood_workout_correlation_ignores_weeks_without_mood_data():
    points = [
        _make_point(0, 1.0),
        _make_point(1, 2.0),
        _make_point(5, None),  # mood verisi yok, dahil edilmemeli
        _make_point(2, 3.0),
        _make_point(3, 4.0),
    ]
    correlation = trend_service.mood_workout_correlation(points)
    assert correlation == pytest.approx(1.0)
