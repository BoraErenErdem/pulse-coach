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
