"""Kayıt araçları başarısızlığı "Kaydedilmedi" önekiyle bildirmeli - orkestratör
yalnız bu öneki başarısız sayıyor; düz hata metni "başarılı" sanılınca model
"kaydettim" deyip sahte kayıt koruması devreye girmiyordu (2026-09-27 canlı
test: yoğunluk göndermeyen kardiyo seti hiç yazılmadı, koç "kaydettim" dedi)."""

from sqlalchemy.orm import Session

from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.agents.orchestrator import _successful_tool_names
from app.agents.tracking_agent import build_tracking_tools
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
        {"exercise_name": "Yüzme", "duration_minutes": 30, "intensity": "çok", "cardio_category": "yuzme"}
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
