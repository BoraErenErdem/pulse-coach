def _register_and_login(client, email="users-test@example.com", password="supersecret1") -> dict:
    client.post("/auth/register", json={"email": email, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password}).json()
    return {"Authorization": f"Bearer {login['access_token']}"}


def test_update_push_token_requires_auth(client):
    response = client.post("/users/me/push-token", json={"expo_push_token": "ExponentPushToken[x]"})
    assert response.status_code == 401


def test_update_push_token_sets_and_clears(client):
    from app.db.session import get_db
    from app.main import app as fastapi_app
    from app.models.user import User

    headers = _register_and_login(client, email="push-token-set@example.com")

    response = client.post(
        "/users/me/push-token", json={"expo_push_token": "ExponentPushToken[abc]"}, headers=headers
    )
    assert response.status_code == 204

    db = next(fastapi_app.dependency_overrides[get_db]())
    try:
        user = db.query(User).filter(User.email == "push-token-set@example.com").first()
        assert user.expo_push_token == "ExponentPushToken[abc]"
    finally:
        db.close()

    clear_response = client.post("/users/me/push-token", json={"expo_push_token": None}, headers=headers)
    assert clear_response.status_code == 204

    db = next(fastapi_app.dependency_overrides[get_db]())
    try:
        user = db.query(User).filter(User.email == "push-token-set@example.com").first()
        assert user.expo_push_token is None
    finally:
        db.close()


def test_export_requires_auth(client):
    response = client.get("/users/me/export")
    assert response.status_code == 401


def test_export_returns_all_user_owned_data(client):
    email = "export-full@example.com"
    headers = _register_and_login(client, email=email)

    client.patch("/profile", json={"goal": "weight_loss"}, headers=headers)
    client.post("/mood", json={"mood_key": "iyi"}, headers=headers)
    client.post("/progress/log", json={"weight": 80, "workout_completed": True, "workout_type": "kuvvet"}, headers=headers)

    response = client.get("/users/me/export", headers=headers)
    assert response.status_code == 200
    body = response.json()

    assert body["user"]["email"] == email
    assert body["profile"]["goal"] == "weight_loss"
    assert len(body["mood_logs"]) == 1
    assert body["mood_logs"][0]["mood_key"] == "iyi"
    assert len(body["progress_logs"]) == 1
    assert body["progress_logs"][0]["workout_type"] == "kuvvet"
    # Yeni bir kullanıcı için henüz veri girilmemiş kategoriler de anahtar
    # olarak mevcut olmalı, sadece boş liste.
    assert body["conversations"] == []
    assert body["checkin_messages"] == []
    assert body["meal_entries"] == []
    assert body["exercise_goals"] == []
    assert body["workout_sessions"] == []
    assert body["meal_photos"] == []


def test_export_includes_meal_photo_metadata_but_not_raw_image_bytes(client, monkeypatch):
    from app.services import photo_meal_service
    from tests.test_photo_meal import FAKE_JPEG_BYTES, _fake_llm

    email = "export-photos@example.com"
    headers = _register_and_login(client, email=email)

    monkeypatch.setattr(
        photo_meal_service, "get_llm", lambda **_kwargs: _fake_llm('[{"food_name": "elma", "estimated_grams": 100}]')
    )
    client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=headers,
    )

    body = client.get("/users/me/export", headers=headers).json()

    assert len(body["meal_photos"]) == 1
    assert body["meal_photos"][0]["detected_items_summary"] == "elma"
    assert "image_data" not in body["meal_photos"][0]


def test_export_does_not_leak_refresh_tokens(client):
    headers = _register_and_login(client, email="export-no-tokens@example.com")
    response = client.get("/users/me/export", headers=headers)
    body = response.json()
    assert "refresh_tokens" not in body
    assert "password_reset_tokens" not in body


def test_export_only_returns_current_users_data(client):
    headers_a = _register_and_login(client, email="export-isolation-a@example.com")
    headers_b = _register_and_login(client, email="export-isolation-b@example.com")

    client.patch("/profile", json={"goal": "muscle_gain"}, headers=headers_a)
    client.patch("/profile", json={"goal": "weight_loss"}, headers=headers_b)

    body_a = client.get("/users/me/export", headers=headers_a).json()
    assert body_a["profile"]["goal"] == "muscle_gain"
    assert body_a["user"]["email"] == "export-isolation-a@example.com"


def test_delete_account_requires_auth(client):
    response = client.request("DELETE", "/users/me", json={"password": "supersecret1"})
    assert response.status_code == 401


def test_delete_account_rejects_wrong_password(client):
    headers = _register_and_login(client, email="delete-wrong-password@example.com")
    response = client.request(
        "DELETE", "/users/me", json={"password": "wrongpassword"}, headers=headers
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Şifre hatalı"

    # Hesap hala duruyor olmalı - /users/me hala erişilebilir.
    me_response = client.get("/users/me", headers=headers)
    assert me_response.status_code == 200


def test_delete_account_rate_limits_after_too_many_wrong_passwords(client):
    """Regresyon: hesap silme şifre doğrulamasında hiç rate limit yoktu -
    çalıntı bir access token'la sınırsız şifre denemesi yapılabiliyordu
    (2026-08-10 sekme mimarisi incelemesinde bulundu)."""
    from app.auth import rate_limit

    headers = _register_and_login(client, email="delete-ratelimit@example.com")

    for _ in range(rate_limit.MAX_ATTEMPTS):
        response = client.request(
            "DELETE", "/users/me", json={"password": "wrongpassword"}, headers=headers
        )
        assert response.status_code == 401

    locked_response = client.request(
        "DELETE", "/users/me", json={"password": "wrongpassword"}, headers=headers
    )
    assert locked_response.status_code == 429
    assert "dakika" in locked_response.json()["detail"]

    # Hesap hala duruyor olmalı - kilitliyken doğru şifre bile denenemez.
    me_response = client.get("/users/me", headers=headers)
    assert me_response.status_code == 200


def test_delete_account_wrong_password_message_respects_english_preference(client):
    headers = _register_and_login(client, email="delete-wrong-password-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)

    response = client.request(
        "DELETE", "/users/me", json={"password": "wrongpassword"}, headers=headers
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect password"


def test_delete_account_removes_user_and_cascades_owned_data(client):
    email = "delete-cascade@example.com"
    headers = _register_and_login(client, email=email, password="supersecret1")
    client.patch("/profile", json={"goal": "weight_loss"}, headers=headers)
    client.post("/mood", json={"mood_key": "iyi"}, headers=headers)

    delete_response = client.request(
        "DELETE", "/users/me", json={"password": "supersecret1"}, headers=headers
    )
    assert delete_response.status_code == 204

    # Eski access token artık geçersiz kullanıcıya işaret ediyor.
    me_response = client.get("/users/me", headers=headers)
    assert me_response.status_code == 401

    # E-posta gerçekten serbest kaldı mı? (User satırı GERÇEKTEN silinmemiş
    # olsaydı unique constraint yüzünden bu kayıt 400 dönerdi.)
    re_register = client.post("/auth/register", json={"email": email, "password": "supersecret1"})
    assert re_register.status_code == 201


def test_delete_account_cascades_meal_photos(client, monkeypatch):
    from app.db.session import get_db
    from app.main import app as fastapi_app
    from app.models.meal_photo import MealPhoto
    from app.services import photo_meal_service
    from tests.test_photo_meal import FAKE_JPEG_BYTES, _fake_llm

    email = "delete-cascade-photos@example.com"
    headers = _register_and_login(client, email=email, password="supersecret1")

    monkeypatch.setattr(
        photo_meal_service, "get_llm", lambda **_kwargs: _fake_llm('[{"food_name": "elma", "estimated_grams": 100}]')
    )
    client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=headers,
    )

    client.request("DELETE", "/users/me", json={"password": "supersecret1"}, headers=headers)

    db = next(fastapi_app.dependency_overrides[get_db]())
    try:
        assert db.query(MealPhoto).count() == 0
    finally:
        db.close()
