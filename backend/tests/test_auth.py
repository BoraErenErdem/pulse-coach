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


def test_login_returns_refresh_token_alongside_access_token(client):
    email = "refresh-login@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    response = client.post("/auth/login", json={"email": email, "password": "supersecret"})

    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["access_token"] != body["refresh_token"]


def test_refresh_issues_a_working_new_access_token(client):
    email = "refresh-works@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    login_body = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()

    refresh_response = client.post("/auth/refresh", json={"refresh_token": login_body["refresh_token"]})
    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]

    me_response = client.get("/users/me", headers={"Authorization": f"Bearer {new_access_token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == email


def test_refresh_token_is_single_use_rotation(client):
    email = "refresh-rotation@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    login_body = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()
    old_refresh_token = login_body["refresh_token"]

    first_use = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert first_use.status_code == 200

    replay_attempt = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert replay_attempt.status_code == 401


def test_refresh_rejects_unknown_token(client):
    response = client.post("/auth/refresh", json={"refresh_token": "not-a-real-refresh-token"})
    assert response.status_code == 401


def test_logout_revokes_refresh_token(client):
    email = "logout-revokes@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    login_body = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()
    refresh_token = login_body["refresh_token"]

    logout_response = client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert logout_response.status_code == 204

    reuse_attempt = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_attempt.status_code == 401


def test_register_rate_limits_after_too_many_attempts_from_same_client(client, monkeypatch):
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "REGISTER_MAX_ATTEMPTS", 3)

    for i in range(3):
        response = client.post(
            "/auth/register", json={"email": f"ratelimit-reg-{i}@example.com", "password": "supersecret"}
        )
        assert response.status_code == 201

    locked_response = client.post(
        "/auth/register", json={"email": "ratelimit-reg-final@example.com", "password": "supersecret"}
    )
    assert locked_response.status_code == 429


def _capture_reset_link(monkeypatch) -> dict:
    from app.services import password_reset_service

    captured: dict = {}

    def fake_send(to_email: str, reset_link: str) -> None:
        captured["to_email"] = to_email
        captured["link"] = reset_link
        captured["count"] = captured.get("count", 0) + 1

    monkeypatch.setattr(password_reset_service.email_service, "send_password_reset_email", fake_send)
    return captured


def test_forgot_password_returns_204_for_existing_and_nonexistent_email(client):
    client.post("/auth/register", json={"email": "reset-exists@example.com", "password": "supersecret"})

    existing_response = client.post("/auth/forgot-password", json={"email": "reset-exists@example.com"})
    assert existing_response.status_code == 204

    missing_response = client.post("/auth/forgot-password", json={"email": "reset-does-not-exist@example.com"})
    assert missing_response.status_code == 204


def test_reset_password_with_valid_token_changes_password(client, monkeypatch):
    captured = _capture_reset_link(monkeypatch)
    email = "reset-flow@example.com"
    client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    client.post("/auth/forgot-password", json={"email": email})

    token = captured["link"].split("token=")[1]
    reset_response = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"})
    assert reset_response.status_code == 204

    old_password_login = client.post("/auth/login", json={"email": email, "password": "oldpassword1"})
    assert old_password_login.status_code == 401

    new_password_login = client.post("/auth/login", json={"email": email, "password": "newpassword1"})
    assert new_password_login.status_code == 200


def test_reset_password_token_is_single_use(client, monkeypatch):
    captured = _capture_reset_link(monkeypatch)
    email = "reset-single-use@example.com"
    client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    client.post("/auth/forgot-password", json={"email": email})
    token = captured["link"].split("token=")[1]

    first_use = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"})
    assert first_use.status_code == 204

    second_use = client.post("/auth/reset-password", json={"token": token, "new_password": "anotherpassword2"})
    assert second_use.status_code == 400


def test_reset_password_rejects_unknown_token(client):
    response = client.post(
        "/auth/reset-password", json={"token": "not-a-real-token", "new_password": "newpassword1"}
    )
    assert response.status_code == 400


def test_reset_password_revokes_existing_refresh_tokens(client, monkeypatch):
    captured = _capture_reset_link(monkeypatch)
    email = "reset-revokes-sessions@example.com"
    client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    login_body = client.post("/auth/login", json={"email": email, "password": "oldpassword1"}).json()
    old_refresh_token = login_body["refresh_token"]

    client.post("/auth/forgot-password", json={"email": email})
    token = captured["link"].split("token=")[1]
    client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"})

    reuse_attempt = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert reuse_attempt.status_code == 401


def test_forgot_password_rate_limits_email_sending_after_too_many_requests(client, monkeypatch):
    from app.auth import rate_limit

    captured = _capture_reset_link(monkeypatch)
    email = "reset-email-lockout@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})

    for _ in range(rate_limit.MAX_ATTEMPTS + 1):
        response = client.post("/auth/forgot-password", json={"email": email})
        # Kilitli olsa bile her zaman 204 - enumeration/lockout durumu dışarı sızmaz.
        assert response.status_code == 204

    assert captured["count"] == rate_limit.MAX_ATTEMPTS
