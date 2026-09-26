from datetime import datetime, timezone

import pytest

from app.services.calorie_recommendation_service import compute_recommendation


def _register_and_login(client, email, password="supersecret"):
    client.post(
        "/auth/register",
        json={"email": email, "password": password, "kvkk_consent": True, "health_data_consent": True, "terms_consent": True},
    )
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _this_year() -> int:
    # Test kullanıcısının saat dilimi yok -> user_today UTC'ye düşer.
    return datetime.now(timezone.utc).year


def test_weight_loss_uses_mifflin_st_jeor_and_500_deficit():
    rec = compute_recommendation(
        weight_kg=80, height_cm=180, age=30, sex="male", activity_level="moderate", goal="weight_loss"
    )
    # BMR = 800 + 1125 - 150 + 5 = 1780; TDEE = 1780 * 1.55 = 2759.
    assert rec.bmr == 1780
    assert rec.tdee == 2759
    assert rec.calories == 2260
    assert rec.adjustment_kcal == -500
    assert rec.protein_g == 130  # 1.6 g/kg
    assert rec.fat_g == 65  # kalorinin %25'i
    assert rec.carbs_g == 295


def test_deficit_is_capped_and_floor_applies_for_small_tdee():
    rec = compute_recommendation(
        weight_kg=50, height_cm=155, age=60, sex="female", activity_level="sedentary", goal="weight_loss"
    )
    # TDEE ~1209: %20 açıkla ~967 olurdu, kadın tabanı 1200.
    assert rec.calories == 1200
    assert rec.adjustment_kcal == -10


def test_muscle_gain_adds_surplus_and_more_protein():
    rec = compute_recommendation(
        weight_kg=70, height_cm=175, age=25, sex="male", activity_level="active", goal="muscle_gain"
    )
    assert rec.tdee == 2887
    assert rec.calories == 3140
    assert rec.adjustment_kcal == 250
    assert rec.protein_g == 125  # 1.8 g/kg = 126


@pytest.mark.parametrize("goal", [None, "general_health", "bilinmeyen"])
def test_no_or_general_goal_means_maintenance(goal):
    rec = compute_recommendation(
        weight_kg=65, height_cm=165, age=35, sex="female", activity_level="light", goal=goal
    )
    assert rec.goal == "general_health"
    assert rec.adjustment_kcal == 0


def test_general_goal_protein_rises_with_activity():
    def protein(activity_level: str) -> int:
        return compute_recommendation(
            weight_kg=84.5, height_cm=185, age=25, sex="male", activity_level=activity_level, goal="general_health"
        ).protein_g

    assert protein("light") == 100  # 1.2 g/kg
    assert protein("moderate") == 120  # 1.4 g/kg


def test_protein_is_capped_by_calorie_share_for_heavy_users():
    rec = compute_recommendation(
        weight_kg=200, height_cm=160, age=50, sex="female", activity_level="sedentary", goal="muscle_gain"
    )
    assert rec.protein_g * 4 <= rec.calories * 0.35 + 10


def test_endpoint_lists_missing_fields(client):
    headers = _register_and_login(client, "calrec-missing@example.com")
    body = client.get("/profile/calorie-recommendation", headers=headers).json()
    assert body["available"] is False
    assert body["missing"] == ["height", "birth_year", "sex", "weight", "activity_level"]
    assert body["calories"] is None


def test_endpoint_returns_recommendation_without_changing_goals(client):
    headers = _register_and_login(client, "calrec-ok@example.com")
    client.patch(
        "/profile",
        json={
            "height_cm": 180,
            "birth_year": _this_year() - 30,
            "sex": "male",
            "activity_level": "moderate",
            "goal": "weight_loss",
            "daily_calorie_goal": 1800,
        },
        headers=headers,
    )
    client.post("/progress/log", json={"weight": 82}, headers=headers)
    client.post("/progress/log", json={"weight": 80}, headers=headers)

    body = client.get("/profile/calorie-recommendation", headers=headers).json()
    assert body["available"] is True
    assert body["missing"] == []
    assert body["weight_kg"] == 80  # en son kayıt
    assert body["age"] == 30
    assert body["calories"] == 2260
    assert body["goal"] == "weight_loss"
    # Öneri hedefi kendiliğinden yazmaz.
    assert client.get("/profile", headers=headers).json()["daily_calorie_goal"] == 1800


def test_profile_accepts_and_clears_body_fields(client):
    headers = _register_and_login(client, "calrec-fields@example.com")
    body = client.patch(
        "/profile", json={"height_cm": 172.5, "birth_year": _this_year() - 40, "sex": "female"}, headers=headers
    ).json()
    assert body["height_cm"] == 172.5
    assert body["birth_year"] == _this_year() - 40
    assert body["sex"] == "female"

    body = client.patch("/profile", json={"height_cm": None, "birth_year": None, "sex": None}, headers=headers).json()
    assert body["height_cm"] is None and body["birth_year"] is None and body["sex"] is None


def test_profile_rejects_out_of_range_body_fields(client):
    headers = _register_and_login(client, "calrec-invalid@example.com")
    year = _this_year()

    too_tall = client.patch("/profile", json={"height_cm": 300}, headers=headers)
    assert too_tall.status_code == 422
    assert too_tall.json()["detail"] == "Boy 50 ile 272 cm arasında olmalı."

    minor = client.patch("/profile", json={"birth_year": year - 17}, headers=headers)
    assert minor.status_code == 422
    assert minor.json()["detail"] == (
        f"Doğum yılı {year - 120} ile {year - 18} arasında olmalı (uygulama 18 yaş ve üstü içindir)."
    )
    assert client.patch("/profile", json={"birth_year": year - 121}, headers=headers).status_code == 422

    bad_sex = client.patch("/profile", json={"sex": "other"}, headers=headers)
    assert bad_sex.status_code == 422

    assert client.patch("/profile", json={"birth_year": year - 18}, headers=headers).status_code == 200


def test_data_export_includes_body_fields(client):
    headers = _register_and_login(client, "calrec-export@example.com")
    client.patch("/profile", json={"height_cm": 170, "birth_year": _this_year() - 25, "sex": "male"}, headers=headers)
    exported = client.get("/users/me/export", headers=headers)
    assert exported.status_code == 200
    profile = exported.json()["profile"]
    assert profile["height_cm"] == 170
    assert profile["sex"] == "male"
