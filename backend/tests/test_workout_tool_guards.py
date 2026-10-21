"""Antrenman kayıt aracının model hatalarına karşı korumaları (2026-09-29 eval'de
bulunanlar) - LLM'e bağımlı olmayan araç testleri."""

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.db.base import Base
from app.exceptions import AppValidationError
from app.models.exercise_catalog import ExerciseCatalog
from app.models.user import User
from app.models.workout_set import WorkoutSet
from app.services import exercise_catalog_service, workout_service
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


def test_failed_call_does_not_block_the_corrected_retry(db_session, monkeypatch):
    """Başarısız çağrının parmak izi "kaydedildi" sayılıyordu: modelin düzeltilmiş
    ikinci çağrısı "zaten kaydedilmiş" diye reddedildi, hiçbir şey yazılmadı."""
    session, user_id = db_session
    tool = _bulk(session, user_id)
    # Servis hatası elle üretilir: geçersiz tür ve yoğunluk artık hata vermiyor
    # (türsüz kaydediliyor / "orta"ya normalize ediliyor), aynı değerlerle başarısız
    # olup sonra başarılı olan bir çağrı başka türlü kurulamıyor.
    with monkeypatch.context() as patched:

        def fail(*_args, **_kwargs):
            raise AppValidationError("at_least_one_set_required")

        patched.setattr(workout_service, "log_sets_to_open_session", fail)
        failed = tool.invoke({"sets": [{"exercise_name": "Plank", "duration_minutes": 10, "intensity": "orta"}]})
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


_PULL_DAY = (
    "Geniş tutuş latpulldown 80kg 10tekrar, 85kg 10 tekrar ve 90 kilo 8 tekrar olcak şekilde "
    "toplamda 3 set yaptım. Sonra Dumbell row ile 40kg ile 4set 10 tekrar yaptım. Sonra da 3 set "
    "Dumbell ile Trapez yaptım. Sonrasında hammer curl ve incline Dumbell biceps çalıştım."
)


def _bulk_with_summary(session, user_id, message):
    from app.agents.workout_tracking_agent import WorkoutTurnSummary

    summary = WorkoutTurnSummary()
    tools = build_workout_tracking_tools(session, user_id, user_message=message, turn_summary=summary)
    return next(t for t in tools if t.name == "log_exercise_sets_bulk"), tools, summary


def test_set_without_reps_is_skipped_and_the_rest_is_saved(db_session):
    """2026-10-20 canlı test: tekrarı verilmeyen trapez toplu kaydın TAMAMINI düşürüyordu
    (koç yine "başarıyla ekledim" dedi); başka denemede tekrar "1" uyduruldu."""
    session, user_id = db_session
    bulk, _tools, summary = _bulk_with_summary(session, user_id, _PULL_DAY)
    result = bulk.invoke(
        {
            "sets": [
                {"exercise_name": "Lat Pulldown", "reps": 10, "weight_kg": 80},
                {"exercise_name": "Lat Pulldown", "reps": 10, "weight_kg": 85},
                {"exercise_name": "Lat Pulldown", "reps": 8, "weight_kg": 90},
                {"exercise_name": "Dumbbell Row", "reps": 10, "weight_kg": 40, "set_count": 4},
                {"exercise_name": "Dumbbell Trapez", "set_count": 3},
                {"exercise_name": "Hammer Curl", "reps": 1},
            ]
        }
    )
    assert result.startswith("DİKKAT - Dumbbell Trapez, Hammer Curl KAYDEDİLMEDİ")
    assert "7 set kaydedildi" in result
    assert session.query(WorkoutSet).count() == 7
    assert session.query(WorkoutSet).filter(WorkoutSet.reps == 1).count() == 0
    assert summary.missing_details == ["Dumbbell Trapez", "Hammer Curl"]


def test_all_sets_without_reps_saves_nothing_and_asks(db_session):
    session, user_id = db_session
    bulk, tools, summary = _bulk_with_summary(session, user_id, "3 set dumbell trapez yaptım")
    result = bulk.invoke({"sets": [{"exercise_name": "Dumbbell Trapez", "set_count": 3}]})
    assert result.startswith("Kaydedilmedi: Dumbbell Trapez için tekrar sayısı")
    assert session.query(WorkoutSet).count() == 0
    single = next(t for t in tools if t.name == "log_exercise_set")
    result = single.invoke({"exercise_name": "Hammer Curl", "weight_kg": 12})
    assert result.startswith("Kaydedilmedi: Hammer Curl için tekrar sayısı")
    assert summary.missing_details == ["Dumbbell Trapez", "Hammer Curl"]


def test_single_rep_is_kept_when_the_user_said_it(db_session):
    session, user_id = db_session
    bulk, _tools, summary = _bulk_with_summary(session, user_id, "Deadlift 140 kg 1 tekrar, sonra 120 kg 5 tekrar")
    result = bulk.invoke(
        {
            "sets": [
                {"exercise_name": "Deadlift", "reps": 1, "weight_kg": 140},
                {"exercise_name": "Deadlift", "reps": 5, "weight_kg": 120},
            ]
        }
    )
    assert "2 set kaydedildi" in result
    assert summary.missing_details == []


def test_nested_sets_inside_an_exercise_are_expanded(db_session):
    """2026-10-20 canlı test, gerçek geçmişle yeniden üretildi: model setleri hareketin
    İÇİNE yazdı; iç liste atılıyor, her hareket kilosuz 1 set kaydediliyordu."""
    session, user_id = db_session
    bulk, _tools, summary = _bulk_with_summary(session, user_id, _PULL_DAY)
    result = bulk.invoke(
        {
            "sets": [
                {
                    "exercise_name": "Lat Pulldown",
                    "reps": 10,
                    "sets": [
                        {"reps": 10, "set_count": 1, "weight_kg": 80},
                        {"reps": 10, "set_count": 1, "weight_kg": 85},
                        {"reps": 8, "set_count": 1, "weight_kg": 90},
                    ],
                },
                {"exercise_name": "Dumbbell Row", "reps": 10, "sets": [{"reps": 10, "set_count": 4, "weight_kg": 40}]},
                {"exercise_name": "Dumbbell Trapez", "sets": [{"set_count": 3}]},
            ]
        }
    )
    assert "7 set kaydedildi" in result
    rows = sorted((s.exercise_name_snapshot, s.reps, s.weight_kg) for s in session.query(WorkoutSet).all())
    assert [r[1:] for r in rows if r[0] == "Lat Pulldown"] == [(8, 90.0), (10, 80.0), (10, 85.0)]
    assert [r[1:] for r in rows if r[0] == "Dumbbell Row"] == [(10, 40.0)] * 4
    assert summary.missing_details == ["Dumbbell Trapez"]


def test_set_count_written_as_nested_sets_number_is_kept(db_session):
    """Eval 2026-10-21 (pull_day_pro): model set sayısını `sets: 4` olarak yazdı; alan
    atılınca her hareketten 1 set kaydediliyordu."""
    session, user_id = db_session
    message = "Pull günü: barfiks 4x8, barbell row 4x10 70 kg, face pull 3x15 20 kg"
    bulk, _tools, _summary = _bulk_with_summary(session, user_id, message)
    result = bulk.invoke(
        {
            "sets": [
                {"exercise_name": "barfiks", "reps": 8, "sets": 4},
                {"exercise_name": "barbell row", "reps": 10, "sets": 4, "weight_kg": 70},
                {"exercise_name": "face pull", "reps": 15, "sets": 3, "weight_kg": 20},
            ]
        }
    )
    assert "11 set kaydedildi" in result
    counts: dict[str, int] = {}
    for s in session.query(WorkoutSet).all():
        counts[s.exercise_name_snapshot] = counts.get(s.exercise_name_snapshot, 0) + 1
    assert sorted(counts.values()) == [3, 4, 4]


@pytest.mark.parametrize(
    ("items", "message", "invented"),
    [
        # Uydurma: trapez cümlesinde 10 yok (önceki hareketten kopyalandı).
        ([("Lat Pulldown", 10), ("Lat Pulldown", 8), ("Dumbbell Row", 10), ("Dumbbell Trapez", 10)], _PULL_DAY, {"Dumbbell Trapez|10"}),
        ([("Geniş tutuş latpulldown", 8), ("Dumbell ile Trapez", 10)], _PULL_DAY, {"Dumbell ile Trapez|10"}),
        # Ad mesajda yoksa (İngilizce ad) ya da çok kısaysa karar verilmez.
        ([("Dumbbell Shrug", 10), ("Dumbbell Row", 10)], _PULL_DAY, set()),
        # Adsız devam cümlesi önceki harekete ait.
        ([("Mekik", 10), ("Mekik", 12)], "Bugün 3x10 mekik yaptım, sonra 2 set daha 12 tekrar", set()),
        ([("Deadlift", 1), ("Deadlift", 5)], "Deadlift 140 kg 1 tekrar, sonra 120 kg 5 tekrar", set()),
        ([("Bench Press", 10)], "bench press 60 kilo 3 set 10 tekrar", set()),
        ([("Kalf makinesi", 12)], "4x12 50kg ile kalf yaptım", set()),
        ([("Squat", 5), ("Romanian Deadlift", 8)], "Bacak günü bitti: squat 5x5 140 kg, romanian deadlift 4x8 100 kg", set()),
        # Sayıdan sonra virgül/nokta (eval pull_day_pro: barfiks silinmişti); ondalık kilo tekrar sanılmaz.
        (
            [("Barfiks", 8), ("Barbell Row", 10), ("Face Pull", 15), ("Hammer Curl", 12)],
            "Pull günü: barfiks 4x8, barbell row 4x10 70 kg, lat pulldown 3x12 60 kg, face pull 3x15 20 kg, hammer curl 3x12.",
            set(),
        ),
        ([("Lateral Raise", 5)], "lateral raise 12,5kg 30 tekrar", {"Lateral Raise|5"}),
        # Kilo değeri tekrar sanılmaz.
        ([("Squat", 60)], "squat 60 kg 10 tekrar yaptım", {"Squat|60"}),
        # Mesajda tekrar bilgisi yoksa (değerler önceki turda) hiç karar verilmez.
        ([("Squat", 5)], "evet squat'ı kaydet", set()),
    ],
)
def test_invented_reps_names(items, message, invented):
    from app.agents.workout_tracking_agent import _invented_reps_names

    assert _invented_reps_names(items, message) == invented
