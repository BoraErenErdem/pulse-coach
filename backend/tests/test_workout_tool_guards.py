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
    # Geçersiz tür parmak izine girmez (yoğunluk "çok" 2026-10-06'dan beri "orta"ya normalize ediliyor).
    failed = tool.invoke(
        {"sets": [{"exercise_name": "Plank", "duration_minutes": 10, "intensity": "orta"}], "workout_type": "gecersiz"}
    )
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


def _tool(session, user_id, message, name):
    tools = build_workout_tracking_tools(session, user_id, user_message=message)
    return next(t for t in tools if t.name == name)


def test_distance_only_cardio_is_not_logged_with_an_invented_duration(db_session):
    """Canlı test 2026-10-06: "Dün 5 km koşmuştum" -> model süreyi 50 dk uydurdu."""
    session, user_id = db_session
    message = "Bu akşam 3 km koştum, bir de 20 mekik çektim"
    single = _tool(session, user_id, message, "log_exercise_set").invoke(
        {"exercise_name": "Koşu", "duration_minutes": 30, "cardio_category": "kosu"}
    )
    assert single.startswith("Kaydedilmedi") and "MESAFE" in single

    bulk = _tool(session, user_id, message, "log_exercise_sets_bulk").invoke(
        {"sets": [{"exercise_name": "Koşu", "duration_minutes": 30, "cardio_category": "kosu"}, {"exercise_name": "Mekik", "reps": 20}]}
    )
    # Kuvvet seti kaydedilir, sonuç "Kaydedilmedi" ile BAŞLAMAZ (orkestratör başarısız sayardı).
    assert bulk.startswith("DİKKAT") and "1 set kaydedildi" in bulk
    assert [s.exercise_name_snapshot for s in session.query(WorkoutSet)] == ["Mekik"]


def test_distance_with_duration_is_logged(db_session):
    session, user_id = db_session
    result = _tool(session, user_id, "5 km'yi 32 dakikada koştum", "log_exercise_set").invoke(
        {"exercise_name": "Koşu", "duration_minutes": 32, "cardio_category": "kosu"}
    )
    assert "Kaydedildi" in result


def test_bulk_calls_on_the_same_day_share_one_session(db_session):
    """Canlı test 2026-10-06: her toplu çağrı yeni oturum açıyordu (tek salon ziyareti
    iki antrenman görünüyordu); numaralar egzersiz başına devam eder."""
    session, user_id = db_session
    message = "Bugün 3x10 mekik yaptım, sonra 2 set daha 12 tekrar"
    bulk = _tool(session, user_id, message, "log_exercise_sets_bulk")
    bulk.invoke({"sets": [{"exercise_name": "Mekik", "reps": 10, "set_count": 3}]})
    second = bulk.invoke({"sets": [{"exercise_name": "Mekik", "reps": 12, "set_count": 2}, {"exercise_name": "Plank", "duration_minutes": 2}]})
    assert "3 set kaydedildi" in second
    sets = session.query(WorkoutSet).order_by(WorkoutSet.id).all()
    assert len({s.session_id for s in sets}) == 1
    assert [s.set_number for s in sets if s.exercise_name_snapshot == "Mekik"] == [1, 2, 3, 4, 5]


def test_bulk_accepts_flat_single_set_arguments(db_session):
    """2026-10-06 eval: model toplu araca tek set aracının düz alanlarını gönderdi
    (sets yok / öğede süre yok) - kardiyo düşüyor, koç yine "kaydettim" diyordu."""
    session, user_id = db_session
    message = "Bugün 10 dakika plank yaptım ve 50 tane mekik çektim"
    bulk = _tool(session, user_id, message, "log_exercise_sets_bulk")

    flat = bulk.invoke({"duration_minutes": 10, "cardio_category": "esneklik", "intensity": "orta", "exercise_name": "Plank"})
    assert "1 set kaydedildi" in flat

    partial = _tool(session, user_id, "Dün 12 dakika koştum", "log_exercise_sets_bulk").invoke(
        {"sets": [{"exercise_name": "Koşu", "set_count": 1}], "duration_minutes": 12, "cardio_category": "kosu", "days_ago": 1}
    )
    assert "1 set kaydedildi" in partial
    assert sorted(s.duration_minutes for s in session.query(WorkoutSet)) == [10, 12]


def test_free_text_intensity_and_category_are_normalized(db_session):
    """2026-10-06 eval: intensity="tempolu"/"Orta", cardio_category="Bisiklet"/"Cardio"
    servis tarafından reddediliyordu - bisiklet senaryosu 1/5'e düştü."""
    session, user_id = db_session
    single = _tool(session, user_id, "Önceki gün 45 dakika bisiklet sürdüm, tempolu", "log_exercise_set")
    result = single.invoke({"exercise_name": "bisiklet sürme", "duration_minutes": 45, "intensity": "tempolu", "cardio_category": "Bisiklet", "days_ago": 2})
    assert "Kaydedildi" in result

    bulk = _tool(session, user_id, "Bugün 20 dakika orta tempo yürüdüm", "log_exercise_sets_bulk")
    result = bulk.invoke({"sets": [{"exercise_name": "Koşu bandı yürüyüşü", "duration_minutes": 20, "intensity": "Orta", "cardio_category": "Yürüyüş"}]})
    assert "1 set kaydedildi" in result
    rows = {s.cardio_category: s.intensity for s in session.query(WorkoutSet)}
    assert rows == {"bisiklet": "orta", "yuruyus": "orta"}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("tempolu", "orta"), ("orta-yüksek", "orta"), ("YOĞUN", "yogun"), ("düşük", "hafif"), (None, None)],
)
def test_normalize_intensity(raw, expected):
    from app.services.met_reference import normalize_intensity

    assert normalize_intensity(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Yürüyüş", "yuruyus"), ("Bisiklet Sürme", "bisiklet"), ("Cardio", "genel_kardiyo"),
     ("koşu bandı yürüyüşü", "yuruyus"), ("İp Atlama", "ip_atlama"), ("yoga", "esneklik"), ("xyz", None)],
)
def test_normalize_cardio_category(raw, expected):
    from app.services.met_reference import normalize_cardio_category

    assert normalize_cardio_category(raw) == expected
