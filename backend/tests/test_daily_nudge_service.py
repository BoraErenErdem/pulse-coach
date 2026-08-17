from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.checkin_message import CheckinMessage
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import daily_nudge_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="nudge@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


FRIDAY = date(2026, 8, 14)


def test_collect_signals_mood_not_logged_true_when_no_mood_today(db_session):
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.mood_not_logged is True


def test_collect_signals_mood_not_logged_false_when_mood_logged_today(db_session):
    session, user_id = db_session
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.mood_not_logged is False


def test_collect_signals_meal_not_logged_false_when_no_nutrition_goal(db_session):
    """Beslenme hedefi yoksa öğün sinyali hiç kontrol edilmez (gate kapalı)."""
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.meal_not_logged is False


def test_collect_signals_meal_not_logged_true_when_goal_set_and_no_meal(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, daily_calorie_goal=2000))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.meal_not_logged is True


def test_collect_signals_meal_not_logged_false_when_goal_set_and_meal_logged(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, daily_calorie_goal=2000))
    session.add(
        MealEntry(
            user_id=user_id,
            food_catalog_id=None,
            food_name_snapshot="Test",
            quantity_grams=100,
            meal_type="ogle",
            log_date=FRIDAY,
            calories_kcal=100,
            protein_g=10,
            carbs_g=10,
            fat_g=5,
        )
    )
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.meal_not_logged is False


# --- streak_at_risk (2026-08-19: günlük streak'e geçişle yeniden tanımlandı -
# "dünden gelen bir seri vardı AMA bugün henüz tamamlanmadı", bkz.
# daily_nudge_service.py::collect_signals) ---


def test_collect_signals_streak_at_risk_true_when_had_streak_and_today_incomplete(db_session):
    session, user_id = db_session
    # Dün (ve önceki gün) ruh hali girilmiş -> dünden gelen streak > 0.
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY - timedelta(days=1)))
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY - timedelta(days=2)))
    session.commit()
    # Bugün (FRIDAY) için HİÇ ruh hali girilmedi -> gün tamamlanmadı.
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.streak_at_risk is True


def test_collect_signals_streak_at_risk_false_when_no_prior_streak(db_session):
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.streak_at_risk is False


def test_collect_signals_streak_at_risk_false_when_today_already_complete(db_session):
    session, user_id = db_session
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY - timedelta(days=1)))
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY)
    assert signals.streak_at_risk is False


def test_any_active_false_when_all_signals_false():
    from app.services.daily_nudge_service import DailyNudgeSignals

    signals = DailyNudgeSignals(mood_not_logged=False, meal_not_logged=False, streak_at_risk=False)
    assert signals.any_active() is False


def test_is_on_cooldown_false_when_no_prior_daily_nudge(db_session):
    session, user_id = db_session
    assert daily_nudge_service.is_on_cooldown(session, user_id, FRIDAY, 3) is False


def test_is_on_cooldown_true_within_window(db_session):
    session, user_id = db_session
    session.add(
        CheckinMessage(
            user_id=user_id, kind="daily_nudge", message="x", generated_at=FRIDAY - timedelta(days=1)
        )
    )
    session.commit()
    assert daily_nudge_service.is_on_cooldown(session, user_id, FRIDAY, 3) is True


def test_is_on_cooldown_false_after_window_passes(db_session):
    session, user_id = db_session
    session.add(
        CheckinMessage(
            user_id=user_id, kind="daily_nudge", message="x", generated_at=FRIDAY - timedelta(days=4)
        )
    )
    session.commit()
    assert daily_nudge_service.is_on_cooldown(session, user_id, FRIDAY, 3) is False


def test_is_on_cooldown_ignores_weekly_summary_rows(db_session):
    """Cooldown SADECE kind='daily_nudge' satırlarına bakar - aynı gün bir
    haftalık özet gönderilmiş olması günlük hatırlatmayı engellememeli."""
    session, user_id = db_session
    session.add(
        CheckinMessage(user_id=user_id, kind="weekly_summary", message="x", generated_at=FRIDAY)
    )
    session.commit()
    assert daily_nudge_service.is_on_cooldown(session, user_id, FRIDAY, 3) is False
