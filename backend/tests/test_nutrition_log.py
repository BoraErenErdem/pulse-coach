from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.food_catalog import FoodCatalog
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import nutrition_log_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="nutrition@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)

    food = FoodCatalog(
        fdc_id=1,
        name_en="Chicken breast, raw",
        name_tr="Tavuk göğsü, çiğ",
        data_type="sr_legacy_food",
        category_tr="Kanatlı Eti Ürünleri",
        calories_kcal=120.0,
        protein_g=20.0,
        carbs_g=0.0,
        fat_g=4.0,
    )
    session.add(food)
    session.commit()
    session.refresh(food)

    try:
        yield session, user.id, food.id
    finally:
        session.close()


def test_log_meal_computes_macros_from_quantity(db_session):
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=150, meal_type="öğle"
    )
    assert entry.calories_kcal == pytest.approx(180.0)
    assert entry.protein_g == pytest.approx(30.0)
    assert entry.food_name_snapshot == "Tavuk göğsü, çiğ"


def test_log_meal_snapshots_english_name_when_language_is_en(db_session):
    """Dil tercihi altyapısı (2026-08-08) - kullanıcının UserProfile.
    preferred_language'i "en" ise food_name_snapshot İngilizce kanonik
    isimle kaydedilmeli, aksi durumda (varsayılan) Türkçe kalmalı."""
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=150, meal_type="öğle", language="en"
    )
    assert entry.food_name_snapshot == "Chicken breast, raw"


def test_log_meal_leaves_sugar_and_sodium_none_when_catalog_lacks_them(db_session):
    """Fixture'daki 'Tavuk göğsü, çiğ' besininin sugar_g/sodium_mg'si yok
    (None) — bu, uydurma bir 0 değeri yazmak yerine kaydın da None kalması
    gerektiğini doğrular (log_meal'in genel 'tahmini değer yazma' ilkesiyle
    tutarlı)."""
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=150, meal_type="öğle"
    )
    assert entry.sugar_g is None
    assert entry.sodium_mg is None


def test_log_meal_scales_sugar_and_sodium_when_catalog_has_them(db_session):
    session, user_id, _ = db_session
    food = FoodCatalog(
        fdc_id=2,
        name_en="Bread, whole wheat",
        name_tr="Tam buğday ekmeği",
        data_type="tr_curated",
        category_tr="Fırın Ürünleri",
        calories_kcal=252.0,
        protein_g=12.45,
        carbs_g=42.71,
        fat_g=3.5,
        sugar_g=4.0,
        sodium_mg=400.0,
    )
    session.add(food)
    session.commit()
    session.refresh(food)

    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food.id, quantity_grams=50, meal_type="kahvaltı"
    )
    assert entry.sugar_g == pytest.approx(2.0)
    assert entry.sodium_mg == pytest.approx(200.0)


def test_generate_daily_nutrition_summary_sums_sugar_sodium_ignoring_missing(db_session):
    session, user_id, food_id_no_sugar = db_session
    food_with = FoodCatalog(
        fdc_id=3,
        name_en="Cheese",
        name_tr="Beyaz peynir",
        data_type="tr_curated",
        category_tr="Süt Ürünleri ve Yumurta",
        calories_kcal=309.0,
        protein_g=20.4,
        carbs_g=2.5,
        fat_g=24.3,
        sugar_g=2.0,
        sodium_mg=1000.0,
    )
    session.add(food_with)
    session.commit()
    session.refresh(food_with)

    # sugar/sodium'u OLAN ve OLMAYAN iki besin aynı gün loglanıyor — toplam,
    # eksik olanı 0 gibi davranıp atlamalı, hata vermemeli.
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id_no_sugar, quantity_grams=100, meal_type="öğle"
    )
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_with.id, quantity_grams=100, meal_type="akşam"
    )

    summary = nutrition_log_service.generate_daily_nutrition_summary(session, user_id)
    assert summary.total_sugar_g == pytest.approx(2.0)
    assert summary.total_sodium_mg == pytest.approx(1000.0)


def test_generate_daily_nutrition_summary_sums_fiber_and_mentions_it_in_text(db_session):
    """Rekabet analizinden gelen öneri: özet metnine görünürlük katmak için
    lif (fiber_g) toplamı da hesaplanmalı ve varsa as_text() içinde geçmeli."""
    session, user_id, food_id_no_fiber = db_session
    food_with_fiber = FoodCatalog(
        fdc_id=4,
        name_en="Lentils, cooked",
        name_tr="Mercimek, pişmiş",
        data_type="tr_curated",
        category_tr="Baklagiller",
        calories_kcal=116.0,
        protein_g=9.0,
        carbs_g=20.1,
        fat_g=0.4,
        fiber_g=7.9,
    )
    session.add(food_with_fiber)
    session.commit()
    session.refresh(food_with_fiber)

    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id_no_fiber, quantity_grams=100, meal_type="öğle"
    )
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_with_fiber.id, quantity_grams=100, meal_type="akşam"
    )

    summary = nutrition_log_service.generate_daily_nutrition_summary(session, user_id)
    assert summary.total_fiber_g == pytest.approx(7.9)
    assert "lif" in summary.as_text().lower()


def test_log_meals_bulk_tool_logs_matched_and_skips_unmatched(db_session):
    """log_meals_bulk, kullanıcının tek mesajda anlattığı tüm besinleri tek
    bir tool-call'da kaydeder; katalogda net eşleşmeyenler tahmini değerle
    kaydedilmez, atlanıp bildirilir — LLM'e bağımlı olmayan deterministik
    regresyon testi."""
    session, user_id, _food_id = db_session
    tools = build_nutrition_tracking_tools(session, user_id)
    bulk_tool = next(t for t in tools if t.name == "log_meals_bulk")

    result = bulk_tool.invoke(
        {
            "meals": [
                {"food_name": "Tavuk göğsü", "quantity_grams": 150, "meal_type": "öğle"},
                {
                    "food_name": "Tamamen Uydurma Besin XYZ123",
                    "quantity_grams": 100,
                    "meal_type": "akşam",
                },
            ]
        }
    )

    assert "1 öğün kaydedildi" in result
    assert "Kaydedilemeyenler" in result

    entries = nutrition_log_service.list_meal_entries(session, user_id)
    assert len(entries) == 1
    assert entries[0].food_name_snapshot == "Tavuk göğsü, çiğ"
    assert entries[0].calories_kcal == pytest.approx(180.0)


def test_delete_meal_entry_removes_entry(db_session):
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=150, meal_type="öğle"
    )

    deleted = nutrition_log_service.delete_meal_entry(session, user_id, entry.id)

    assert deleted is True
    assert nutrition_log_service.list_meal_entries(session, user_id) == []


def test_delete_meal_entry_returns_false_for_other_user(db_session):
    session, user_id, food_id = db_session
    other = User(email="other-nutrition@example.com", hashed_password="x")
    session.add(other)
    session.commit()
    session.refresh(other)
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=150, meal_type="öğle"
    )

    assert nutrition_log_service.delete_meal_entry(session, other.id, entry.id) is False
    assert len(nutrition_log_service.list_meal_entries(session, user_id)) == 1


def test_update_meal_entry_recomputes_macros_from_new_quantity(db_session):
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="öğle"
    )

    updated = nutrition_log_service.update_meal_entry(session, user_id, entry.id, quantity_grams=200)

    assert updated.quantity_grams == 200
    assert updated.calories_kcal == pytest.approx(240.0)
    assert updated.protein_g == pytest.approx(40.0)


def test_update_meal_entry_changes_meal_type_only(db_session):
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="öğle"
    )

    updated = nutrition_log_service.update_meal_entry(session, user_id, entry.id, meal_type="akşam")

    assert updated.meal_type == "akşam"
    assert updated.calories_kcal == pytest.approx(120.0)  # miktar değişmedi, makro aynı kalmalı


def test_update_meal_entry_rejects_invalid_meal_type(db_session):
    session, user_id, food_id = db_session
    entry = nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="öğle"
    )
    with pytest.raises(ValueError):
        nutrition_log_service.update_meal_entry(session, user_id, entry.id, meal_type="gece yarısı")


def test_log_meal_rejects_invalid_meal_type(db_session):
    session, user_id, food_id = db_session
    with pytest.raises(ValueError):
        nutrition_log_service.log_meal(
            session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="gece yarısı"
        )


def test_log_meal_rejects_unknown_food_catalog_id(db_session):
    session, user_id, _food_id = db_session
    with pytest.raises(ValueError):
        nutrition_log_service.log_meal(
            session, user_id, food_catalog_id=9999, quantity_grams=100, meal_type="kahvaltı"
        )


def test_log_meal_rejects_non_positive_quantity(db_session):
    session, user_id, food_id = db_session
    with pytest.raises(ValueError):
        nutrition_log_service.log_meal(
            session, user_id, food_catalog_id=food_id, quantity_grams=0, meal_type="kahvaltı"
        )


def test_generate_daily_nutrition_summary_without_goals(db_session):
    session, user_id, food_id = db_session
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=200, meal_type="akşam"
    )

    summary = nutrition_log_service.generate_daily_nutrition_summary(session, user_id)

    assert summary.entry_count == 1
    assert summary.total_calories_kcal == pytest.approx(240.0)
    assert summary.calorie_goal is None
    assert "%" not in summary.as_text()


def test_generate_daily_nutrition_summary_with_goals(db_session):
    session, user_id, food_id = db_session
    session.add(UserProfile(user_id=user_id, daily_calorie_goal=1200, daily_protein_goal_g=100))
    session.commit()
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=500, meal_type="öğle"
    )

    summary = nutrition_log_service.generate_daily_nutrition_summary(session, user_id)

    assert summary.total_calories_kcal == pytest.approx(600.0)
    assert summary.calorie_goal == 1200
    assert "%50" in summary.as_text()


def test_generate_daily_nutrition_summary_empty_when_no_entries(db_session):
    session, user_id, _food_id = db_session
    summary = nutrition_log_service.generate_daily_nutrition_summary(session, user_id)
    assert summary.entry_count == 0
    assert "girilmemiş" in summary.as_text()


def test_list_meal_entries_filters_by_days(db_session):
    session, user_id, food_id = db_session
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="kahvaltı",
        log_date=date.today() - timedelta(days=30),
    )
    nutrition_log_service.log_meal(
        session, user_id, food_catalog_id=food_id, quantity_grams=100, meal_type="öğle",
        log_date=date.today() - timedelta(days=1),
    )

    entries = nutrition_log_service.list_meal_entries(session, user_id, days=7)
    assert len(entries) == 1
    assert entries[0].meal_type == "öğle"


def _register_and_login(client, email="nutrition-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_food(client_test_food_id=1):
    """Test client'ın kullandığı (conftest.py override'lı) DB session'ına
    doğrudan erişip bir FoodCatalog satırı ekler."""
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    db.add(
        FoodCatalog(
            fdc_id=client_test_food_id,
            name_en="Rice, white, cooked",
            name_tr="Pirinç, beyaz, pişmiş",
            data_type="sr_legacy_food",
            category_tr="Tahıllar ve Makarna",
            calories_kcal=130.0,
            protein_g=2.7,
            carbs_g=28.2,
            fat_g=0.3,
        )
    )
    db.commit()
    food_id = db.query(FoodCatalog).filter(FoodCatalog.fdc_id == client_test_food_id).first().id
    db.close()
    return food_id


def test_log_entry_endpoint(client):
    headers = _register_and_login(client, email="nutrition-api-log@example.com")
    food_id = _seed_food()

    response = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": food_id, "quantity_grams": 200, "meal_type": "öğle"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["calories_kcal"] == pytest.approx(260.0)


def test_log_entry_endpoint_rejects_unknown_food(client):
    headers = _register_and_login(client, email="nutrition-api-unknown@example.com")
    response = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": 9999, "quantity_grams": 100, "meal_type": "kahvaltı"},
        headers=headers,
    )
    assert response.status_code == 422


def test_daily_summary_endpoint(client):
    headers = _register_and_login(client, email="nutrition-api-summary@example.com")
    food_id = _seed_food()
    client.post(
        "/nutrition/entries",
        json={"food_catalog_id": food_id, "quantity_grams": 100, "meal_type": "kahvaltı"},
        headers=headers,
    )

    response = client.get("/nutrition/daily-summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["entry_count"] == 1
    assert body["summary_text"].strip() != ""


def test_search_foods_endpoint(client):
    headers = _register_and_login(client, email="nutrition-api-search@example.com")
    _seed_food()

    response = client.get("/nutrition/foods/search", params={"q": "pirinç"}, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_nutrition_requires_authentication(client):
    response = client.get("/nutrition/daily-summary")
    assert response.status_code == 401


def test_delete_entry_endpoint(client):
    headers = _register_and_login(client, email="nutrition-api-delete@example.com")
    food_id = _seed_food(client_test_food_id=201)
    create_response = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": food_id, "quantity_grams": 100, "meal_type": "kahvaltı"},
        headers=headers,
    )
    entry_id = create_response.json()["id"]

    delete_response = client.delete(f"/nutrition/entries/{entry_id}", headers=headers)
    assert delete_response.status_code == 204

    list_response = client.get("/nutrition/entries", headers=headers)
    assert list_response.json() == []


def test_delete_entry_endpoint_not_found(client):
    headers = _register_and_login(client, email="nutrition-api-delete-404@example.com")
    response = client.delete("/nutrition/entries/999999", headers=headers)
    assert response.status_code == 404


def test_delete_entry_endpoint_rejects_other_users_entry(client):
    headers_a = _register_and_login(client, email="nutrition-api-owner-a@example.com")
    headers_b = _register_and_login(client, email="nutrition-api-owner-b@example.com")
    food_id = _seed_food(client_test_food_id=202)
    create_response = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": food_id, "quantity_grams": 100, "meal_type": "kahvaltı"},
        headers=headers_a,
    )
    entry_id = create_response.json()["id"]

    response = client.delete(f"/nutrition/entries/{entry_id}", headers=headers_b)
    assert response.status_code == 404
    assert len(client.get("/nutrition/entries", headers=headers_a).json()) == 1


def test_update_entry_endpoint(client):
    headers = _register_and_login(client, email="nutrition-api-update@example.com")
    food_id = _seed_food(client_test_food_id=203)
    create_response = client.post(
        "/nutrition/entries",
        json={"food_catalog_id": food_id, "quantity_grams": 100, "meal_type": "kahvaltı"},
        headers=headers,
    )
    entry_id = create_response.json()["id"]

    response = client.patch(
        f"/nutrition/entries/{entry_id}",
        json={"quantity_grams": 200},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["quantity_grams"] == 200
    assert body["calories_kcal"] == pytest.approx(260.0)


def test_list_entries_endpoint_respects_limit(client):
    headers = _register_and_login(client, email="nutrition-api-limit@example.com")
    food_id = _seed_food(client_test_food_id=204)
    for _ in range(3):
        client.post(
            "/nutrition/entries",
            json={"food_catalog_id": food_id, "quantity_grams": 100, "meal_type": "kahvaltı"},
            headers=headers,
        )

    response = client.get("/nutrition/entries?limit=2", headers=headers)
    assert len(response.json()) == 2


@pytest.mark.integration
def test_chat_logs_meal_via_tool_call(client):
    headers = _register_and_login(client, email="nutrition-chat@example.com")
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    db.add(
        FoodCatalog(
            fdc_id=42,
            name_en="Chicken breast, raw",
            name_tr="Tavuk göğsü",
            data_type="sr_legacy_food",
            category_tr="Kanatlı Eti Ürünleri",
            calories_kcal=119.0,
            protein_g=21.4,
            carbs_g=0.0,
            fat_g=3.08,
        )
    )
    db.commit()
    db.close()

    response = client.post("/chat", json={"message": "150 gram tavuk göğsü yedim, öğle yemeğimde."}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "nutrition_tracking_agent" in body["agent_used"]

    summary_response = client.get("/nutrition/daily-summary", headers=headers)
    assert summary_response.json()["entry_count"] >= 1
