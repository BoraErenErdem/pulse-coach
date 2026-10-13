"""Kayıt araçları başarısızlığı "Kaydedilmedi" önekiyle bildirmeli - orkestratör
yalnız bu öneki başarısız sayıyor; düz hata metni "başarılı" sanılınca model
"kaydettim" deyip sahte kayıt koruması devreye girmiyordu (2026-09-27 canlı
test: yoğunluk göndermeyen kardiyo seti hiç yazılmadı, koç "kaydettim" dedi)."""

from sqlalchemy.orm import Session

from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.agents.orchestrator import _successful_tool_names
from app.agents.tracking_agent import DURATION_WORKOUT_REDIRECT, build_tracking_tools
from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.models.progress_log import ProgressLog
from app.models.workout_set import WorkoutSet
from langchain_core.messages import ToolMessage
from tests.test_log_date import db_session  # noqa: F401 - fixture


def _tool(tools, name):
    return next(t for t in tools if t.name == name)


def test_duration_set_without_intensity_defaults_to_medium(db_session):  # noqa: F811
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")

    result = tool.invoke({"exercise_name": "Yüzme", "duration_minutes": 30, "cardio_category": "yuzme"})

    assert result.startswith("Kaydedildi")
    assert [s.intensity for s in session.query(WorkoutSet)] == ["orta"]


def test_bulk_duration_set_without_intensity_defaults_to_medium(db_session):  # noqa: F811
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_sets_bulk")

    result = tool.invoke({"sets": [{"exercise_name": "Koşu", "duration_minutes": 20, "cardio_category": "kosu"}]})

    assert "1 set kaydedildi" in result
    assert [s.intensity for s in session.query(WorkoutSet)] == ["orta"]


def test_validation_error_is_reported_as_not_saved(db_session):  # noqa: F811
    session, user_id = db_session
    tool = _tool(build_workout_tracking_tools(session, user_id), "log_exercise_set")

    result = tool.invoke(
        # Aralık dışı süre (yoğunluk "çok" 2026-10-06'dan, geçersiz tür 2026-10-13'ten beri
        # hata vermiyor: biri "orta"ya normalize ediliyor, diğeri türsüz kaydediliyor).
        {"exercise_name": "Yüzme", "duration_minutes": 100000, "intensity": "orta", "cardio_category": "yuzme"}
    )

    assert result.startswith("Kaydedilmedi")
    message = ToolMessage(content=result, name="log_exercise_set", tool_call_id="1")
    assert _successful_tool_names([message]) == set()


def test_meal_bulk_with_nothing_saved_is_reported_as_not_saved(db_session: tuple[Session, int]):  # noqa: F811
    session, user_id = db_session
    tool = _tool(build_nutrition_tracking_tools(session, user_id), "log_meals_bulk")

    result = tool.invoke({"meals": [{"food_name": "Uydurma Besin XYZ123", "quantity_grams": 100, "meal_type": "öğle"}]})

    assert result.startswith("Kaydedilmedi")


def test_log_progress_with_invalid_workout_type_still_saves(db_session):  # noqa: F811
    """Önceden "bu bilgi olmadan kaydedildi" deyip hiçbir şey kaydetmiyordu."""
    session, user_id = db_session
    tool = _tool(build_tracking_tools(session, user_id), "log_progress")

    result = tool.invoke({"workout_completed": True, "workout_type": "yüzme"})

    assert "türsüz kaydedildi" in result
    logs = session.query(ProgressLog).filter_by(user_id=user_id).all()
    assert [(p.workout_completed, p.workout_type) for p in logs] == [(True, None)]


_CYCLING_MESSAGE = "Dün akşam 45 dakika tempolu bisiklet sürmüştüm onu da ekle. Bu sabah da tartıldım 83,4 kilo geldim."


def test_log_progress_redirects_duration_workout_to_set_tool(db_session):  # noqa: F811
    """2026-10-13 eval: süreli kardiyo yalnız "antrenman yapıldı" işaretiyle
    kaydediliyor, süre kayboluyor, koç yine de "45 dakikayı kaydettim" diyordu."""
    session, user_id = db_session
    tool = _tool(build_tracking_tools(session, user_id, user_message=_CYCLING_MESSAGE), "log_progress")

    result = tool.invoke({"workout_completed": True, "workout_type": "kardiyo", "days_ago": 1})

    assert result.startswith(DURATION_WORKOUT_REDIRECT)
    assert "log_exercise_set" in result
    assert session.query(ProgressLog).filter_by(user_id=user_id).count() == 0
    message = ToolMessage(content=result, name="log_progress", tool_call_id="1")
    assert _successful_tool_names([message]) == set()


def test_log_progress_keeps_measurement_when_redirecting_workout(db_session):  # noqa: F811
    session, user_id = db_session
    tool = _tool(build_tracking_tools(session, user_id, user_message=_CYCLING_MESSAGE), "log_progress")

    result = tool.invoke({"weight": 83.4, "workout_completed": True, "workout_type": "kardiyo"})

    assert result.startswith("Kayıt eklendi")
    assert DURATION_WORKOUT_REDIRECT in result
    logs = session.query(ProgressLog).filter_by(user_id=user_id).all()
    assert [(p.weight, p.workout_completed) for p in logs] == [(83.4, False)]


def test_log_progress_mark_is_skipped_when_duration_set_already_logged(db_session):  # noqa: F811
    """Model önce seti, sonra işareti gönderirse: set kaydı işareti zaten oluşturdu."""
    session, user_id = db_session
    message = "Bugün 30 dakika yüzdüm."
    set_tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_set")
    assert set_tool.invoke({"exercise_name": "Yüzme", "duration_minutes": 30, "cardio_category": "yuzme"}).startswith(
        "Kaydedildi"
    )
    tool = _tool(build_tracking_tools(session, user_id, user_message=message), "log_progress")

    result = tool.invoke({"workout_completed": True, "workout_type": "kardiyo"})

    assert "zaten kayıtlı" in result
    assert not result.startswith("Kaydedilmedi")
    # Yalnız set kaydının kendi işareti var, ikincisi eklenmedi.
    assert session.query(ProgressLog).filter_by(user_id=user_id, workout_completed=True).count() == 1


def test_log_progress_plain_workout_mark_still_works(db_session):  # noqa: F811
    """Süre yoksa ya da tür süreli değilse işaret eskisi gibi kaydedilir."""
    session, user_id = db_session
    no_duration = _tool(build_tracking_tools(session, user_id, user_message="Bugün koşuya çıktım."), "log_progress")
    assert no_duration.invoke({"workout_completed": True, "workout_type": "kardiyo"}).startswith("Kayıt eklendi")
    strength = _tool(
        build_tracking_tools(session, user_id, user_message="8 saat uyudum, sabah ağırlık çalıştım."), "log_progress"
    )
    assert strength.invoke({"workout_completed": True, "workout_type": "kuvvet"}).startswith("Kayıt eklendi")
    assert session.query(ProgressLog).filter_by(user_id=user_id, workout_completed=True).count() == 2


def test_nameless_duration_set_takes_category_from_message(db_session):  # noqa: F811
    """2026-10-13 eval: model süreli seti adsız ve kategorisiz gönderdi, set düştü,
    koç "yürüyüşü kaydettim" dedi. Mesajda tek süreli aktivite varsa kategori oradan."""
    session, user_id = db_session
    message = "Bugün bench press 4x8 70 kg yaptım, en son 20 dakika koşu bandında orta tempo yürüdüm"
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_set")

    result = tool.invoke({"duration_minutes": 20, "intensity": "orta", "workout_type": "kardiyo"})

    assert result.startswith("Kaydedildi")
    assert [(s.duration_minutes, s.cardio_category) for s in session.query(WorkoutSet)] == [(20, "yuruyus")]


def test_nameless_duration_set_with_two_durations_still_asks(db_session):  # noqa: F811
    session, user_id = db_session
    message = "Sabah 30 dakika koştum, akşam 20 dakika bisiklet sürdüm"
    tool = _tool(build_workout_tracking_tools(session, user_id, user_message=message), "log_exercise_set")

    result = tool.invoke({"duration_minutes": 30})

    assert result.startswith("Kaydedilmedi")
    assert session.query(WorkoutSet).count() == 0


def test_set_with_invalid_workout_type_is_saved_without_type(db_session):  # noqa: F811
    """2026-10-13 eval: "10 dakika plank" workout_type="core" ile geldi, set
    "Geçersiz antrenman türü" ile düştü, koç yine de "ekledim" dedi."""
    session, user_id = db_session
    tools = build_workout_tracking_tools(session, user_id, user_message="Bugün 10 dakika plank yaptım")

    single = _tool(tools, "log_exercise_set").invoke(
        {"exercise_name": "Plank", "duration_minutes": 10, "workout_type": "core"}
    )
    bulk = _tool(tools, "log_exercise_sets_bulk").invoke(
        {"sets": [{"exercise_name": "Mekik", "reps": 50}, {"exercise_name": "Mekik", "reps": 40}], "workout_type": "karın"}
    )

    assert single.startswith("Kaydedildi")
    assert not bulk.startswith("Kaydedilmedi")
    assert session.query(WorkoutSet).count() == 3
