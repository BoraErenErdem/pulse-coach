def test_register_login_and_me(client):
    register_response = client.post(
        "/auth/register", json={"email": "test@example.com", "password": "supersecret"}
    )
    assert register_response.status_code == 201
    assert register_response.json()["email"] == "test@example.com"

    duplicate_response = client.post(
        "/auth/register", json={"email": "test@example.com", "password": "supersecret"}
    )
    assert duplicate_response.status_code == 400

    login_response = client.post(
        "/auth/login", json={"email": "test@example.com", "password": "supersecret"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    wrong_login_response = client.post(
        "/auth/login", json={"email": "test@example.com", "password": "wrong"}
    )
    assert wrong_login_response.status_code == 401

    me_response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "test@example.com"

    unauthorized_response = client.get("/users/me")
    assert unauthorized_response.status_code == 401


def test_register_rejects_invalid_email(client):
    response = client.post(
        "/auth/register", json={"email": "not-an-email", "password": "supersecret"}
    )
    assert response.status_code == 422


def test_login_rejects_nonexistent_user(client):
    response = client.post(
        "/auth/login", json={"email": "ghost@example.com", "password": "supersecret"}
    )
    assert response.status_code == 401


def test_me_rejects_malformed_token(client):
    response = client.get("/users/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert response.status_code == 401


def test_register_rejects_short_password(client):
    response = client.post(
        "/auth/register", json={"email": "shortpass@example.com", "password": "short1"}
    )
    assert response.status_code == 422


def test_login_locks_out_after_too_many_failed_attempts(client):
    from app.auth import rate_limit

    email = "lockout-test@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    rate_limit.clear_attempts(email)  # onceki testlerden sizinti olmasin

    for _ in range(rate_limit.MAX_ATTEMPTS):
        response = client.post("/auth/login", json={"email": email, "password": "wrong"})
        assert response.status_code == 401

    locked_response = client.post("/auth/login", json={"email": email, "password": "supersecret"})
    assert locked_response.status_code == 429

    rate_limit.clear_attempts(email)  # sonraki testleri etkilemesin


def test_login_success_clears_failed_attempt_counter(client):
    from app.auth import rate_limit

    email = "lockout-reset-test@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    rate_limit.clear_attempts(email)

    client.post("/auth/login", json={"email": email, "password": "wrong"})
    client.post("/auth/login", json={"email": email, "password": "wrong"})
    success_response = client.post("/auth/login", json={"email": email, "password": "supersecret"})
    assert success_response.status_code == 200

    assert rate_limit.is_locked_out(email) is False
