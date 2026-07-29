import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    catalog = [
        FoodCatalog(
            fdc_id=1,
            name_en="Chicken breast, raw",
            name_tr="Tavuk göğsü, çiğ",
            data_type="sr_legacy_food",
            category_tr="Kanatlı Eti Ürünleri",
            calories_kcal=119,
            protein_g=21.4,
            carbs_g=0.0,
            fat_g=3.08,
        ),
        FoodCatalog(
            fdc_id=2,
            name_en="Rice, white, cooked",
            name_tr="Pirinç, beyaz, pişmiş",
            data_type="sr_legacy_food",
            category_tr="Tahıllar ve Makarna",
            calories_kcal=130,
            protein_g=2.7,
            carbs_g=28.2,
            fat_g=0.3,
        ),
    ]
    session.add_all(catalog)
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_search_foods_finds_close_match(db_session):
    results = food_catalog_service.search_foods(db_session, "tavuk göğsü", limit=5)
    names = [row.name_tr for row in results]
    assert "Tavuk göğsü, çiğ" in names


def test_search_foods_returns_empty_list_when_catalog_empty():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    assert food_catalog_service.search_foods(session, "pirinç") == []
    session.close()


def test_best_match_returns_high_score_for_exact_name(db_session):
    match, score = food_catalog_service.best_match(db_session, "Pirinç, beyaz, pişmiş")
    assert match is not None
    assert match.fdc_id == 2
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD
