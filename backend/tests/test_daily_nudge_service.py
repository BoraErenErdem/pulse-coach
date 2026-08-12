from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.checkin_message import CheckinMessage
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import daily_nudge_service

STREAK_RISK_WEEKDAY = 4  # Cuma


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


# 2026-08-14 bir Cuma (weekday()==4) - "hafta sonuna yaklaşılıyor" testleri
# için sabit bir referans.
FRIDAY = date(2026, 8, 14)


def test_collect_signals_mood_not_logged_true_when_no_mood_today(db_session):
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.mood_not_logged is True


def test_collect_signals_mood_not_logged_false_when_mood_logged_today(db_session):
    session, user_id = db_session
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=FRIDAY))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.mood_not_logged is False


def test_collect_signals_meal_not_logged_false_when_no_nutrition_goal(db_session):
    """Beslenme hedefi yoksa öğün sinyali hiç kontrol edilmez (gate kapalı)."""
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.meal_not_logged is False


def test_collect_signals_meal_not_logged_true_when_goal_set_and_no_meal(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, daily_calorie_goal=2000))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
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
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.meal_not_logged is False


def test_collect_signals_streak_at_risk_true_when_all_three_conditions_met(db_session):
    session, user_id = db_session
    # Önceki hafta (Pazartesi-Pazar) bir kayıt var -> streak_before_this_week > 0.
    previous_week_day = FRIDAY - timedelta(weeks=1)
    session.add(ProgressLog(user_id=user_id, weight=80, log_date=previous_week_day))
    session.commit()
    # Bu hafta HİÇ kayıt yok, bugün Cuma (nearing_end_of_week True).
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.streak_at_risk is True


def test_collect_signals_streak_at_risk_false_when_no_prior_streak(db_session):
    session, user_id = db_session
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.streak_at_risk is False


def test_collect_signals_streak_at_risk_false_when_this_week_already_logged(db_session):
    session, user_id = db_session
    previous_week_day = FRIDAY - timedelta(weeks=1)
    session.add(ProgressLog(user_id=user_id, weight=80, log_date=previous_week_day))
    session.add(ProgressLog(user_id=user_id, weight=79, log_date=FRIDAY))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, FRIDAY, STREAK_RISK_WEEKDAY)
    assert signals.streak_at_risk is False


def test_collect_signals_streak_at_risk_false_when_not_nearing_end_of_week(db_session):
    session, user_id = db_session
    monday = FRIDAY - timedelta(days=4)  # aynı haftanın Pazartesi'si
    previous_week_day = monday - timedelta(weeks=1)
    session.add(ProgressLog(user_id=user_id, weight=80, log_date=previous_week_day))
    session.commit()
    signals = daily_nudge_service.collect_signals(session, user_id, monday, STREAK_RISK_WEEKDAY)
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
