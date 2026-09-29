"""Antrenman kayıt aracının model hatalarına karşı korumaları (2026-09-29 eval'de
bulunanlar) - LLM'e bağımlı olmayan araç testleri."""

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.db.base import Base
from app.models.exercise_catalog import ExerciseCatalog
from app.models.user import User
from app.models.workout_set import WorkoutSet
from app.services import exercise_catalog_service
from tests.db_utils import make_test_engine

_MESSAGE = "Bugün 10 dakika plank yaptım ve 50 tane mekik çektim"


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="guards@example.com", hashed_password="x")
    session.add(user)
    for name_en, name_tr, category in (("Plank", "Plank", "kuvvet"), ("Sit-Up", "Mekik", "kuvvet"), ("Running", "Koşu", "kardiyo")):
        session.add(
            ExerciseCatalog(
                source_id=name_en,
                name_en=name_en,
                name_tr=name_tr,
                category_tr=category,
                equipment_tr="-",
                primary_muscles_tr="-",
                level_tr="orta",
            )
        )
    session.commit()
    exercise_catalog_service.invalidate_cache()
    try:
        yield session, user.id
    finally:
        session.close()
        exercise_catalog_service.invalidate_cache()


def _bulk(session, user_id):
    tools = build_workout_tracking_tools(session, user_id, user_message=_MESSAGE)
    return next(t for t in tools if t.name == "log_exercise_sets_bulk")


def test_duration_set_without_category_gets_a_default(db_session):
    """Model "10 dakika plank"ı cardio_category=None ile gönderdi; önceden
    "Geçersiz kategori: None" ile HİÇBİR set kaydedilmiyordu."""
    session, user_id = db_session
    result = _bulk(session, user_id).invoke(
        {
            "sets": [
                {"exercise_name": "Plank", "duration_minutes": 10, "cardio_category": None},
                {"exercise_name": "Mekik", "reps": 50},
            ]
        }
    )
    assert "2 set kaydedildi" in result
    plank = session.query(WorkoutSet).filter(WorkoutSet.duration_minutes == 10).one()
    assert plank.cardio_category == "esneklik"


def test_duration_set_on_cardio_row_defaults_to_general_cardio(db_session):
    session, user_id = db_session
    result = _bulk(session, user_id).invoke({"sets": [{"exercise_name": "Koşu", "duration_minutes": 20}]})
    assert "1 set kaydedildi" in result
    run = session.query(WorkoutSet).one()
    assert run.cardio_category == "genel_kardiyo"


def test_failed_call_does_not_block_the_corrected_retry(db_session):
    """Başarısız çağrının parmak izi "kaydedildi" sayılıyordu: modelin düzeltilmiş
    ikinci çağrısı "zaten kaydedilmiş" diye reddedildi, hiçbir şey yazılmadı."""
    session, user_id = db_session
    tool = _bulk(session, user_id)
    failed = tool.invoke({"sets": [{"exercise_name": "Plank", "duration_minutes": 10, "intensity": "çok"}]})
    assert failed.startswith("Kaydedilmedi")

    retried = tool.invoke({"sets": [{"exercise_name": "Plank", "duration_minutes": 10, "intensity": "orta"}]})
    assert "1 set kaydedildi" in retried
    assert session.query(WorkoutSet).count() == 1

    repeated = tool.invoke({"sets": [{"exercise_name": "Plank", "duration_minutes": 10, "intensity": "orta"}]})
    assert "zaten kaydedilmiş" in repeated
    assert session.query(WorkoutSet).count() == 1


def test_zero_weight_is_stored_as_bodyweight(db_session):
    session, user_id = db_session
    result = _bulk(session, user_id).invoke({"sets": [{"exercise_name": "Mekik", "reps": 20, "weight_kg": 0, "set_count": 2}]})
    assert "2 set kaydedildi" in result
    assert [s.weight_kg for s in session.query(WorkoutSet)] == [None, None]
