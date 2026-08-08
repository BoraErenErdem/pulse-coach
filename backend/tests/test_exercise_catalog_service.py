import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.exercise_catalog import ExerciseCatalog
from app.services import exercise_catalog_service, fuzzy_match


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    catalog = [
        ExerciseCatalog(
            source_id="Barbell_Bench_Press",
            name_en="Barbell Bench Press",
            name_tr="Barbell Bench Press",
            category_tr="kuvvet",
            equipment_tr="barbell",
            primary_muscles_tr="göğüs",
            level_tr="orta",
        ),
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            equipment_tr="barbell",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        ),
        ExerciseCatalog(
            source_id="Push_Up",
            name_en="Push-Up",
            name_tr="Şınav",
            category_tr="kuvvet",
            equipment_tr="vücut ağırlığı",
            primary_muscles_tr="göğüs",
            level_tr="başlangıç",
        ),
    ]
    session.add_all(catalog)
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_search_exercises_finds_close_match(db_session):
    results = exercise_catalog_service.search_exercises(db_session, "bench press", limit=3)
    names = [row.name_tr for row in results]
    assert "Barbell Bench Press" in names


def test_search_exercises_returns_empty_list_when_catalog_empty():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    assert exercise_catalog_service.search_exercises(session, "squat") == []
    session.close()


def test_best_match_returns_high_score_for_exact_name(db_session):
    match, score = exercise_catalog_service.best_match(db_session, "Squat")
    assert match is not None
    assert match.name_tr == "Squat"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_returns_low_score_for_unrelated_query(db_session):
    match, score = exercise_catalog_service.best_match(db_session, "zzzzz not an exercise at all")
    assert score < exercise_catalog_service.FUZZY_MATCH_THRESHOLD or match is None


def test_best_match_finds_same_row_via_turkish_or_english_name(db_session):
    tr_match, tr_score = exercise_catalog_service.best_match(db_session, "Şınav")
    en_match, en_score = exercise_catalog_service.best_match(db_session, "Push Up")
    assert tr_match is not None and en_match is not None
    assert tr_match.id == en_match.id
    assert tr_score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD
    assert en_score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_search_exercises_finds_match_by_english_query(db_session):
    results = exercise_catalog_service.search_exercises(db_session, "push up", limit=3)
    names = [row.name_tr for row in results]
    assert "Şınav" in names


def test_search_exercises_does_not_return_duplicate_rows(db_session):
    # Aday listesi her satırı iki kez (TR+EN) içeriyor - sonuç dedupe edilmiş
    # olmalı, aynı satır iki kez dönmemeli.
    results = exercise_catalog_service.search_exercises(db_session, "press", limit=10)
    ids = [row.id for row in results]
    assert len(ids) == len(set(ids))


def test_best_match_ignores_parenthetical_descriptor(db_session):
    """Canlı testte bulundu (2026-08-08): model sıkça tanımlayıcı bir
    parantez ekliyor (ör. 'chest press makinesi (üst göğüs odaklı)') — bu
    kelimeler kataloğun kullanmadığı serbest açıklamalar, eklenince
    kelime-eşleştirme aşamasını kırıp aramanın YALNIZ başına 'bench press'
    ile başaracağı eşleşmeyi kaçırıyordu (bkz. fuzzy_match._strip_parenthetical)."""
    match, score = exercise_catalog_service.best_match(
        db_session, "Barbell Bench Press (üst göğüs odaklı)"
    )
    assert match is not None
    assert match.name_tr == "Barbell Bench Press"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_fuzzy_match_deprioritizes_equipment_variant_over_plain_match():
    """Regresyon testi — bkz. project_health_coach_status.md, 2026-08-08
    'squat/lateral bare-kelime' turu. Kataloğa sade bir kanonik kayıt hiç
    eklenmemişse (ör. sadece 'Squat Jerk' ve 'Squat with Bands' gibi
    varyantlar varsa), bant/zincir/plaka belirten bir varyant SADECE
    UZUNLUĞU KISA diye kanonik-olmayan başka bir hareketin ('Squat Jerk'
    gibi) önüne geçmemeli — sorgu bunu istemiyorsa `_prefix_rank` bunu
    tier-2'ye iter (bkz. fuzzy_match.py). Gerçek regresyon: 'squat' sorgusu
    canlı katalogda 'Squat Jerk'e (58 puanla değil 100 puanla, YANLIŞ bir
    Olimpik kaldırış tekniğine) eşleşiyordu."""
    items = ["Squat Jerk", "Squat with Bands", "Squat with Chains"]
    match, score = fuzzy_match.best_match("squat", items, lambda x: x)
    assert match == "Squat Jerk"


def test_fuzzy_match_keeps_equipment_variant_when_query_asks_for_it():
    """Yukarıdaki testin tersi: kullanıcı ZATEN 'bantlı squat' gibi bir
    ekipman varyantı istiyorsa, o varyant demote EDİLMEMELİ — tier-2 kuralı
    sadece sorgu bunu istemediği hâlde bir varyantın öne geçmesini önlüyor."""
    items = ["Squat Jerk", "Squat with Bands", "Squat with Chains"]
    match, score = fuzzy_match.best_match("squat with bands", items, lambda x: x)
    assert match == "Squat with Bands"


def test_search_exercises_cache_refreshes_after_invalidate(db_session):
    """Katalog process-level cache'leniyor (bkz. exercise_catalog_service.py) -
    aynı session/engine'e sonradan eklenen bir satır invalidate_cache()
    çağrılmadan görünmemeli, çağrıldıktan sonra görünmeli."""
    exercise_catalog_service.search_exercises(db_session, "squat", limit=3)  # cache doldurulur

    db_session.add(
        ExerciseCatalog(
            source_id="Brand_New_Exercise",
            name_en="Brand new exercise",
            name_tr="Yepyeni egzersiz",
            category_tr="kuvvet",
            equipment_tr="yok",
            primary_muscles_tr="tüm vücut",
            level_tr="başlangıç",
        )
    )
    db_session.commit()

    stale_results = exercise_catalog_service.search_exercises(db_session, "yepyeni egzersiz", limit=3)
    stale_names = [row.name_tr for row in stale_results]
    assert "Yepyeni egzersiz" not in stale_names

    exercise_catalog_service.invalidate_cache()
    fresh_results = exercise_catalog_service.search_exercises(db_session, "yepyeni egzersiz", limit=3)
    names = [row.name_tr for row in fresh_results]
    assert "Yepyeni egzersiz" in names
