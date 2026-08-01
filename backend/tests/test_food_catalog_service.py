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


def test_best_match_prefers_prefix_match_over_shorter_word_containing_candidate(db_session):
    """Gerçek regresyon (2026-08-01): 'Pirinç pilavı (sade)' kataloğa
    eklendikten sonra 'Şehriyeli pirinç pilavı' de eklenince, fuzzy-match'in
    'sorgunun tüm kelimelerini içeren EN KISA kayıt' kuralı "pirinç pilavı"
    aramasını yanlışlıkla şehriyeli varyanta yönlendirdi (o isim daha
    kısaydı) — sade pilav ismi 'pirinç pilavı' ile BAŞLADIĞI için artık
    doğrudan (starts-with) eşleşip önceliği alıyor."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=100,
                name_en="Rice pilaf, plain",
                name_tr="Pirinç pilavı (sade)",
                data_type="tr_curated",
                category_tr="Tahıllar ve Makarna",
                calories_kcal=130,
                protein_g=2.7,
                carbs_g=28.2,
                fat_g=0.3,
            ),
            FoodCatalog(
                fdc_id=101,
                name_en="Rice pilaf with vermicelli",
                name_tr="Şehriyeli pirinç pilavı",
                data_type="tr_curated",
                category_tr="Tahıllar ve Makarna",
                calories_kcal=171,
                protein_g=3.16,
                carbs_g=30.69,
                fat_g=3.74,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "pirinç pilavı")

    assert match is not None
    assert match.fdc_id == 100
    assert score == 100.0


def test_best_match_prefers_qualified_variant_over_shorter_unrelated_compound(db_session):
    """Gerçek regresyon (2026-08-01, fotoğraf analizi canlı testinde
    bulundu): "domates" sorgusu, katalogda "Domates, çiğ" gibi nitelikli bir
    varyant yokken, sadece EN KISA isim olduğu için "Domates tozu"na (kurutulmuş
    toz, ~302 kcal/100g) eşleşiyordu — gerçek domatesten (~18 kcal/100g) ~17x
    yanlış bir kalori değeri sessizce döndürülüyordu. Artık "İsim, sıfat"
    kalıbına uyan nitelikli varyantlar (aynı temel besinin çeşidi), sadece
    sorguyla başlayan ama virgülsüz devam eden alakasız/farklı bir ürünün
    (ör. "...tozu", "...sosu") önüne geçiyor."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=200,
                name_en="Tomato powder",
                name_tr="Domates tozu",
                data_type="sr_legacy_food",
                category_tr="Sebzeler",
                calories_kcal=302,
                protein_g=12.9,
                carbs_g=74.7,
                fat_g=0.44,
            ),
            FoodCatalog(
                fdc_id=201,
                name_en="Tomatoes, yellow, raw",
                name_tr="Domates, sarı, çiğ",
                data_type="sr_legacy_food",
                category_tr="Sebzeler",
                calories_kcal=15,
                protein_g=0.98,
                carbs_g=2.98,
                fat_g=0.26,
            ),
            FoodCatalog(
                fdc_id=202,
                name_en="Tomatoes, red, ripe, raw",
                name_tr="Domates, çiğ",
                data_type="tr_curated",
                category_tr="Sebzeler",
                calories_kcal=18,
                protein_g=0.88,
                carbs_g=3.89,
                fat_g=0.2,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "domates")

    assert match is not None
    assert match.fdc_id == 202
    assert score == 100.0
