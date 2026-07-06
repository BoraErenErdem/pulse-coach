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
