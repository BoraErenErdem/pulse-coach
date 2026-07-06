import pytest


def _register_and_login(client, email="chat@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.integration
def test_chat_updates_profile_via_tool_call(client):
    headers = _register_and_login(client)

    response = client.post(
        "/chat",
        json={"message": "Kilo vermek istiyorum, hedefim bu."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent_used"] in {"orchestrator", "profile_agent"}
    assert isinstance(body["reply"], str) and body["reply"].strip() != ""

    history_response = client.get("/chat/history", headers=headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"


@pytest.mark.integration
def test_chat_requires_authentication(client):
    response = client.post("/chat", json={"message": "Merhaba"})
    assert response.status_code == 401
