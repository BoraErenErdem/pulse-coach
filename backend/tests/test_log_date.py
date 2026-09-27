"""Sohbetten geçmiş güne kayıt (`days_ago`, bkz. app/agents/log_date.py) -
LLM'e bağımlı olmayan araç testleri."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.log_date import format_tr_date, resolve_log_date, today_context
from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.agents.tracking_agent import build_tracking_tools
from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.db.base import Base
from app.models.food_catalog import FoodCatalog
from app.models.meal_entry import MealEntry
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.services.user_time import local_today
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="logdate@example.com", hashed_password="x")
    session.add(user)
    session.add(
        FoodCatalog(
            fdc_id=1,
            name_en="Chicken breast, raw",
            name_tr="Tavuk göğsü, çiğ",
            data_type="sr_legacy_food",
            category_tr="Kanatlı Eti Ürünleri",
            calories_kcal=120.0,
            protein_g=20.0,
            carbs_g=0.0,
            fat_g=4.0,
        )
    )
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _tool(tools, name):
    return next(t for t in tools if t.name == name)


def test_format_helpers():
    assert format_tr_date(date(2026, 9, 25)) == "25 Eylül"
    assert today_context(date(2026, 9, 27)) == "27 Eylül 2026, Pazar"


def test_resolve_log_date_accepts_none_and_rejects_out_of_range(db_session):
    session, user_id = db_session
    today = local_today(None)
    assert resolve_log_date(session, user_id, None) == today
    assert resolve_log_date(session, user_id, 0) == today
    assert resolve_log_date(session, user_id, 2) == today - timedelta(days=2)
    assert str(resolve_log_date(session, user_id, -1)).startswith("Kaydedilmedi")
    assert str(resolve_log_date(session, user_id, 8)).startswith("Kaydedilmedi")


def test_log_exercise_set_writes_to_past_day_and_names_the_date(db_session):
    session, user_id = db_session
    yesterday = local_today(None) - timedelta(days=1)
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")

    result = tool.invoke(
        {"exercise_name": "Yüzme", "duration_minutes": 30, "intensity": "orta", "cardio_category": "yuzme", "days_ago": 1}
    )

    assert format_tr_date(yesterday) in result and "dün" in result
    sessions = session.query(WorkoutSession).filter_by(user_id=user_id).all()
    assert [s.session_date for s in sessions] == [yesterday]
    # Otomatik ilerleme kaydı da aynı güne yazılmalı.
    assert [p.log_date for p in session.query(ProgressLog).filter_by(user_id=user_id)] == [yesterday]


def test_log_exercise_set_rejects_future_day(db_session):
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")

    result = tool.invoke({"exercise_name": "Squat", "reps": 10, "days_ago": -1})

    assert result.startswith("Kaydedilmedi")
    assert session.query(WorkoutSession).count() == 0


def test_bulk_sets_same_as_today_are_not_skipped_as_repeat_for_past_day(db_session):
    """Tekrar koruması bugünün kayıtlarıyla dolduruluyor - "dün de aynısını
    yaptım" bugünkünün tekrarı sanılıp atlanmamalı."""
    session, user_id = db_session
    sets = [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60, "set_count": 3}]
    _tool(build_workout_tracking_tools(session, user_id), "log_exercise_sets_bulk").invoke({"sets": sets})

    tools = build_workout_tracking_tools(session, user_id)
    result = _tool(tools, "log_exercise_sets_bulk").invoke({"sets": sets, "days_ago": 1})

    assert "3 set kaydedildi" in result
    dates = sorted(s.session_date for s in session.query(WorkoutSession).filter_by(user_id=user_id))
    today = local_today(None)
    assert dates == [today - timedelta(days=1), today]


def test_single_set_forwarded_to_bulk_keeps_days_ago(db_session):
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")

    tool.invoke({"exercise_name": "Squat", "reps": 10, "weight_kg": 60, "set_count": 3, "days_ago": 2})

    dates = [s.session_date for s in session.query(WorkoutSession).filter_by(user_id=user_id)]
    assert dates == [local_today(None) - timedelta(days=2)]


def test_log_meal_and_bulk_write_to_past_day(db_session):
    session, user_id = db_session
    tools = build_nutrition_tracking_tools(session, user_id)
    yesterday = local_today(None) - timedelta(days=1)

    single = _tool(tools, "log_meal").invoke(
        {"food_name": "tavuk göğsü", "quantity_grams": 150, "meal_type": "akşam", "days_ago": 1}
    )
    bulk = _tool(tools, "log_meals_bulk").invoke(
        {"meals": [{"food_name": "tavuk göğsü", "quantity_grams": 100, "meal_type": "öğle"}], "days_ago": 1}
    )

    assert format_tr_date(yesterday) in single and format_tr_date(yesterday) in bulk
    assert [m.log_date for m in session.query(MealEntry).filter_by(user_id=user_id)] == [yesterday, yesterday]


def test_log_meal_today_has_no_date_note(db_session):
    session, user_id = db_session
    tool = _tool(build_nutrition_tracking_tools(session, user_id), "log_meal")

    result = tool.invoke({"food_name": "tavuk göğsü", "quantity_grams": 150, "meal_type": "akşam"})

    assert result.startswith("Kaydedildi") and "Tarih:" not in result


def test_log_progress_writes_to_past_day(db_session):
    session, user_id = db_session
    tool = _tool(build_tracking_tools(session, user_id), "log_progress")

    result = tool.invoke({"weight": 80, "days_ago": 2})

    assert "2 gün önce" in result
    logs = session.query(ProgressLog).filter_by(user_id=user_id).all()
    assert [p.log_date for p in logs] == [local_today(None) - timedelta(days=2)]


def test_log_progress_rejects_too_old_day(db_session):
    session, user_id = db_session
    tool = _tool(build_tracking_tools(session, user_id), "log_progress")

    assert tool.invoke({"weight": 80, "days_ago": 30}).startswith("Kaydedilmedi")
    assert session.query(ProgressLog).count() == 0


@pytest.mark.parametrize(
    ("message", "expected_days"),
    [
        ("dün 40 dakika yüzdüm", 1),
        ("Dünkü antrenmanı yazayım", 1),
        ("evvelsi gün akşam tavuk yedim", 2),
        ("dünden önceki gün 80 kiloydum", 2),
        ("3 gün önce bacak çalıştım", 3),
        ("üç gün önce koştum", 3),
        ("bugün squat yaptım", None),
        ("dünya kupası izledim", None),
        ("dün koştum, evvelsi gün yüzdüm", None),  # iki farklı gün - ipucu yok
        ("10 gün önce koştum", None),
    ],
)
def test_relative_day_hint(message, expected_days):
    from app.agents.log_date import relative_day_hint

    today = date(2026, 9, 27)
    hint = relative_day_hint(message, today)
    if expected_days is None:
        assert hint is None
    else:
        assert hint is not None
        assert f"days_ago={expected_days}" in hint
        assert format_tr_date(today - timedelta(days=expected_days)) in hint
