"""Kayıtlı besin adlarının arayüz diline göre gösterimi (2026-10-05, egzersiz
adlarının kardeşi - bkz. test_exercise_names.py): TR kaydedilen öğün EN
arayüzde TR görünmeye devam ediyordu."""

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.food_catalog import FoodCatalog
from app.models.meal_entry import MealEntry
from app.models.user import User
from app.schemas.nutrition import MealEntryRead
from app.services import nutrition_log_service
from tests.db_utils import make_test_engine


def _food(session, fdc_id: int, name_tr: str, name_en: str) -> int:
    row = FoodCatalog(
        fdc_id=fdc_id,
        name_tr=name_tr,
        name_en=name_en,
        data_type="sr_legacy_food",
        calories_kcal=155.0,
        protein_g=13.0,
        carbs_g=1.0,
        fat_g=11.0,
    )
    session.add(row)
    session.commit()
    return row.id


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="food-names@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    try:
        yield session, user.id
    finally:
        session.close()


def test_meal_saved_in_turkish_has_english_display_name(db_session):
    session, user_id = db_session
    egg = _food(session, 1, "Yumurta, haşlanmış", "Egg, whole, hard-boiled")
    entry = nutrition_log_service.log_meal(session, user_id, food_catalog_id=egg, quantity_grams=50, meal_type="kahvaltı")

    read = MealEntryRead.model_validate(entry)
    assert read.food_name_snapshot == "Yumurta, haşlanmış"
    assert (read.food_name_tr, read.food_name_en) == ("Yumurta, haşlanmış", "Egg, whole, hard-boiled")


def test_corrected_catalog_name_is_shown_for_old_entries(db_session):
    """Ad her zaman katalogdan türetildiği için bağ güvenilir: katalogda
    sonradan düzeltilen çeviri eski kayıtta da görünür."""
    session, user_id = db_session
    drink = _food(session, 2, "Besleyici içeçek", "Nutritional drink")
    entry = nutrition_log_service.log_meal(session, user_id, food_catalog_id=drink, quantity_grams=200, meal_type="öğle")
    session.query(FoodCatalog).filter(FoodCatalog.id == drink).update({"name_tr": "Besleyici içecek"})
    session.commit()
    session.expire_all()

    assert entry.food_name_tr == "Besleyici içecek"
    assert entry.food_name_snapshot == "Besleyici içeçek"


def test_missing_catalog_row_keeps_saved_name_in_both_languages(db_session):
    session, user_id = db_session
    entry = MealEntry(
        user_id=user_id,
        food_catalog_id=None,
        food_name_snapshot="Havuç, çiğ",
        meal_type="öğle",
        quantity_grams=100,
        calories_kcal=41,
        protein_g=1,
        carbs_g=10,
        fat_g=0,
    )
    session.add(entry)
    session.commit()

    assert (entry.food_name_tr, entry.food_name_en) == ("Havuç, çiğ", "Havuç, çiğ")


def test_repeat_guard_works_across_languages(db_session):
    """TR sohbette kaydedilen öğün ertesi turda EN sohbette aynen tekrar
    kaydedilmemeli: guard'ın DB seed'i snapshot'a (TR) bakıyordu, EN turdaki
    kontrol EN adla yapıldığı için eşleşmiyordu."""
    session, user_id = db_session
    _food(session, 3, "Yumurta, haşlanmış", "Egg, whole, hard-boiled")
    meals = {"meals": [{"food_name": "haşlanmış yumurta", "quantity_grams": 100, "meal_type": "kahvaltı"}]}

    bulk_tr = next(t for t in build_nutrition_tracking_tools(session, user_id, language="tr") if t.name == "log_meals_bulk")
    bulk_tr.invoke(meals)
    bulk_en = next(t for t in build_nutrition_tracking_tools(session, user_id, language="en") if t.name == "log_meals_bulk")
    result = bulk_en.invoke(meals)

    assert "zaten kaydedilmişti" in result
    assert len(nutrition_log_service.list_meal_entries(session, user_id)) == 1


def _auth(client, email):
    body = {"email": email, "password": "supersecret", "kvkk_consent": True, "health_data_consent": True, "terms_consent": True}
    client.post("/auth/register", json=body)
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_api_returns_both_language_names(client):
    headers = _auth(client, "food-names-api@example.com")
    egg = _food(next(app.dependency_overrides[get_db]()), 4, "Yumurta, haşlanmış", "Egg, whole, hard-boiled")
    created = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": egg, "quantity_grams": 50, "meal_type": "kahvaltı"},
        headers={**headers, "X-Preferred-Language": "tr"},
    )
    assert created.status_code == 200
    assert created.json()["food_name_en"] == "Egg, whole, hard-boiled"

    entry = client.get("/nutrition/entries", headers=headers).json()[0]
    assert (entry["food_name_tr"], entry["food_name_en"]) == ("Yumurta, haşlanmış", "Egg, whole, hard-boiled")
