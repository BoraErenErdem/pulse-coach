import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.exercise_catalog import ExerciseCatalog
from app.services import exercise_catalog_service


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
