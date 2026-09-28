"""Sohbetten geçmiş güne kayıt (`days_ago`, bkz. app/agents/log_date.py) -
LLM'e bağımlı olmayan araç testleri."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.log_date import expected_days_ago, format_tr_date, relative_day_hint, resolve_log_date, today_context
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


def test_resolve_log_date_expected_overrides_model_value_but_not_future(db_session):
    session, user_id = db_session
    today = local_today(None)
    assert resolve_log_date(session, user_id, 1, expected=2) == today - timedelta(days=2)
    assert resolve_log_date(session, user_id, None, expected=2) == today - timedelta(days=2)
    assert str(resolve_log_date(session, user_id, -1, expected=2)).startswith("Kaydedilmedi")


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Önceki gün 45 dakika bisiklet sürdüm", 2),
        ("dün akşam pilav yedim", 1),
        ("3 gün önce yüzdüm", 3),
        ("dün squat yaptım, bugün de koştum", None),  # iki farklı gün
        ("Bugün koştum, dün de yüzdüm", None),
        ("dün koştum yarın da koşacağım", None),
        ("kahvaltıda yumurta yedim", None),
        ("10 gün önce koştum", None),
    ],
)
def test_expected_days_ago(message, expected):
    assert expected_days_ago(message) == expected


def test_workout_tool_uses_expected_day_over_model_value(db_session):
    """2026-09-28 canlı test: "önceki gün bisiklet sürdüm" - model days_ago=1 verdi."""
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id, expected_days_ago=2), "log_exercise_set")

    tool.invoke({"exercise_name": "Bisiklet", "duration_minutes": 45, "intensity": "yogun", "cardio_category": "bisiklet", "days_ago": 1})

    dates = [s.session_date for s in session.query(WorkoutSession).filter_by(user_id=user_id)]
    assert dates == [local_today(None) - timedelta(days=2)]


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


def test_history_date_label():
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    from app.agents.log_date import history_date_label

    ist = ZoneInfo("Europe/Istanbul")
    today = date(2026, 9, 27)
    # Bugün (yerel) -> etiket yok; UTC 22:30 = İstanbul 01:30 ertesi gün
    assert history_date_label(datetime(2026, 9, 27, 9, 0), ist, today) is None
    assert history_date_label(datetime(2026, 9, 26, 22, 30), ist, today) is None
    assert history_date_label(datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc), ist, today) == "dün"
    assert history_date_label(datetime(2026, 9, 25, 12, 0), ist, today) == "25 Eylül"
    assert history_date_label(None, ist, today) is None


def test_bulk_without_duration_warns_when_message_mentions_minutes(db_session):
    """2026-09-28 canlı test: kuvvet setleri kaydedildi, 20 dk koşu bandı atlandı."""
    session, user_id = db_session
    message = "bench 4x8 70 kg, en son 20 dakika koşu bandı"
    tools = build_workout_tracking_tools(session, user_id, user_message=message)

    first = _tool(tools, "log_exercise_sets_bulk").invoke(
        {"sets": [{"exercise_name": "Bench Press", "reps": 8, "weight_kg": 70, "set_count": 4}]}
    )
    assert "UYARI" in first
    second = _tool(tools, "log_exercise_set").invoke(
        {"exercise_name": "Koşu bandı", "duration_minutes": 20, "intensity": "orta", "cardio_category": "kosu"}
    )
    assert "UYARI" not in second
    # Süre anılmayan mesajda uyarı yok.
    plain = build_workout_tracking_tools(session, user_id, user_message="squat 3x10 60 kg")
    assert "UYARI" not in _tool(plain, "log_exercise_set").invoke({"exercise_name": "Squat", "reps": 10, "weight_kg": 60})


@pytest.mark.parametrize(
    ("reply", "message", "expected"),
    [
        ("Dün, yani 26 Eylül tarihinde kaydettim.", "Önceki gün bisiklet sürdüm", "Önceki gün, yani 26 Eylül tarihinde kaydettim."),
        ("Evet dün koşmuşsun.", "3 gün önce koştum", "Evet 3 gün önce koşmuşsun."),
        ("Dün yüzdün.", "dün yüzdüm", "Dün yüzdün."),  # kullanıcı da dün dedi
        ("Dünya rekoru!", "önceki gün koştum", "Dünya rekoru!"),
        ("Dün de koştun.", "bugün koştum", "Dün de koştun."),  # tek geçmiş gün yok
    ],
)
def test_fix_wrong_yesterday(reply, message, expected):
    from app.agents.log_date import fix_wrong_yesterday

    assert fix_wrong_yesterday(reply, message) == expected


def test_bulk_undoes_set_count_multiplied_onto_distinct_sets(db_session):
    """2026-09-28 eval: "3 set; 70kg 10, 75kg 8, 80kg 6" -> her elemana set_count=3
    (9 set). Elemana özgü çarpan yazılmışsa ("3x10 50kg, 3x10 55kg") dokunulmaz."""
    from app.models.workout_set import WorkoutSet

    session, user_id = db_session
    message = "3 set dumbbell chest press; 70kg 10 tekrar, 75kg 8 tekrar, 80kg 6 tekrar"
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_sets_bulk")
    rows = [(10, 70.0), (8, 75.0), (6, 80.0)]
    tool.invoke({"sets": [{"exercise_name": "Göğüs Pres X", "reps": r, "weight_kg": kg, "set_count": 3} for r, kg in rows]})
    got = sorted((s.reps, s.weight_kg) for s in session.query(WorkoutSet).all())
    assert got == sorted(rows)

    message = "bench 3x10 50kg, 3x10 55kg"
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_sets_bulk")
    tool.invoke({"sets": [{"exercise_name": "Bench Y", "reps": 10, "weight_kg": kg, "set_count": 3} for kg in (50, 55)]})
    assert session.query(WorkoutSet).filter(WorkoutSet.exercise_name_snapshot == "Bench Y").count() == 6


def test_bulk_expands_drop_set_collapsed_into_one_item(db_session):
    """2026-09-28 eval: "3 drop set; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18 tekrar"
    -> tek eleman {30, 12.5, set_count 3}. Mesajdaki bitişik listeden açılır."""
    from app.models.workout_set import WorkoutSet

    session, user_id = db_session
    message = (
        "3 drop set dumbell lateral raise; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18 tekrar. "
        "squat 3 set 100kg 5 tekrar, bench 80kg 8 tekrar"
    )
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_sets_bulk")
    tool.invoke(
        {
            "sets": [
                {"exercise_name": "Lateral Z", "reps": 30, "weight_kg": 12.5, "set_count": 3},
                # gerçek "aynı değerle 3 set": listenin devamı başka harekete ait -> açılmaz
                {"exercise_name": "Squat Z", "reps": 5, "weight_kg": 100, "set_count": 3},
                {"exercise_name": "Bench Z", "reps": 8, "weight_kg": 80},
            ]
        }
    )
    by_name: dict[str, list] = {}
    for s in session.query(WorkoutSet).all():
        by_name.setdefault(s.exercise_name_snapshot, []).append((s.reps, s.weight_kg))
    assert sorted(by_name["Lateral Z"]) == [(18, 7.5), (24, 10.0), (30, 12.5)]
    assert by_name["Squat Z"] == [(5, 100.0)] * 3
    assert by_name["Bench Z"] == [(8, 80.0)]


def test_single_set_tool_accepts_numeric_sets_argument(db_session):
    """2026-09-28 eval: model tek set aracına `sets: 1` gönderdi, şema hatası kaydı düşürdü."""
    from app.models.workout_set import WorkoutSet

    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")
    result = tool.invoke({"exercise_name": "Squat W", "reps": 5, "weight_kg": 90, "sets": 1})
    assert result.startswith("Kaydedildi")
    assert session.query(WorkoutSet).count() == 1


def test_hint_separates_past_day_from_today_in_mixed_message():
    """2026-09-28 canlı test: "Dün 45 dk bisiklet... Bu sabah tartıldım 83,4 kilo" - kilo
    da düne yazıldı. Karışık mesajda ipucu bugüne ait kayıtlar için days_ago'yu boş istemeli."""
    hint = relative_day_hint("Dün akşam 45 dakika bisiklet sürdüm. Bu sabah tartıldım 83,4 kilo", date(2026, 9, 28))
    assert hint is not None and "bu sabah" in hint and "BOŞ" in hint
    plain = relative_day_hint("Dün akşam 45 dakika bisiklet sürdüm", date(2026, 9, 28))
    assert plain is not None and "BOŞ" not in plain


def test_mixed_day_message_writes_weight_to_today(db_session):
    """Model kiloya days_ago=1 verse de "bu sabah ... 83,4" cümlesi bugündür."""
    from app.agents.log_date import days_ago_for_value

    session, user_id = db_session
    message = "Dün akşam 45 dakika bisiklet sürmüştüm. Bu sabah da tartıldım 83,4 kilo geldim."
    assert days_ago_for_value(message, 83.4) == 0
    assert days_ago_for_value(message, 45.0) == 1
    assert days_ago_for_value("dün 83,4 kiloydum", 83.4) is None  # tek gün: expected_days_ago işi
    tool = _tool(build_tracking_tools(session, user_id, None, message), "log_progress")
    tool.invoke({"weight": 83.4, "days_ago": 1})
    assert [p.log_date for p in session.query(ProgressLog).filter_by(user_id=user_id)] == [local_today(None)]


def test_bulk_restores_equipment_word_the_model_dropped(db_session):
    """2026-09-28 eval: mesajda "makinede shoulder press" varken model "Shoulder Press"
    gönderdi, sade "Omuz Presi"ne kaydedildi."""
    from app.models.exercise_catalog import ExerciseCatalog
    from app.models.workout_set import WorkoutSet
    from app.services import exercise_catalog_service

    session, user_id = db_session
    for source_id, en, tr in (
        ("Shoulder_Press", "Shoulder Press", "Omuz Presi"),
        ("Machine_Shoulder_Military_Press", "Machine Shoulder (Military) Press", "Makinede Omuz Presi"),
    ):
        session.add(ExerciseCatalog(source_id=source_id, name_en=en, name_tr=tr, category_tr="kuvvet", equipment_tr="-", primary_muscles_tr="-", level_tr="orta"))
    session.commit()
    exercise_catalog_service.invalidate_cache()
    message = "Dördüncü hareket 3 set makinede shoulder press; 60kg 8 tekrar, 65kg 7 tekrar, 70kg 6 tekrar."
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_sets_bulk")
    tool.invoke({"sets": [{"exercise_name": "Shoulder Press", "reps": r, "weight_kg": w} for r, w in ((8, 60), (7, 65), (6, 70))]})
    assert {s.exercise_name_snapshot for s in session.query(WorkoutSet).all()} == {"Makinede Omuz Presi"}


def test_bulk_expands_drop_set_even_when_model_invents_set_count(db_session):
    """Eval: 3 çiftlik drop listesine model set_count=4 verdi; ağırlık düştüğü için mevcut
    3 çiftle açılır."""
    from app.models.workout_set import WorkoutSet

    session, user_id = db_session
    message = "3 drop set lateral raise; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18 tekrar"
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_sets_bulk")
    tool.invoke({"sets": [{"exercise_name": "Lateral Q", "reps": 30, "weight_kg": 12.5, "set_count": 4}]})
    assert sorted((s.reps, s.weight_kg) for s in session.query(WorkoutSet).all()) == [(18, 7.5), (24, 10.0), (30, 12.5)]
