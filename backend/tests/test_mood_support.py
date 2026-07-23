import pytest

from app.agents.mood_support_agent import CRISIS_RESPONSE, check_crisis_indicators


def _register_and_login(client, email="mood@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "message",
    [
        "Artık kendime zarar vermeyi düşünüyorum",
        "Bazen intihar etmeyi düşünüyorum",
        "Canıma kıymak istiyorum",
        "Yaşamak istemiyorum artık",
        "Ölmek istiyorum",
        "olmeyi dusunuyorum bazen", # aksansız yazım
        "Keşke bir daha uyanmak istemiyorum",
        "Ölsem daha iyi olur herkes için",
        "Aylardır kendimi kötü hissediyorum, hiçbir şeyden zevk almıyorum",
        "Kendimi kusturuyorum yemek yedikten sonra",
        "Günlerdir hiçbir şey yemedim",
        "Kendimi aç bırakıyorum kilo vermek için",
    ],
)
def test_check_crisis_indicators_detects_crisis_signals(message):
    assert check_crisis_indicators(message) is True


@pytest.mark.parametrize(
    "message",
    [
        "Bugün antrenmanı atladım, kendimi biraz kötü hissediyorum",
        "Bu hafta hiç motivasyonum yok",
        "Diyetimden saptım, tatlı yedim",
        "Bugün 78 kilo geldim",
        "Squat yaparken dizim ağrıyor mu diye merak ediyorum",
        "Yorgunum ama devam edeceğim",
    ],
)
def test_check_crisis_indicators_does_not_flag_normal_messages(message):
    assert check_crisis_indicators(message) is False


@pytest.mark.integration
def test_chat_crisis_message_returns_fixed_template_without_llm(client):
    headers = _register_and_login(client)

    response = client.post(
        "/chat",
        json={"message": "Artık yaşamak istemiyorum, kendime zarar vermeyi düşünüyorum."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent_used"] == "mood_support_agent"
    assert body["reply"] == CRISIS_RESPONSE
    assert "112" in body["reply"]

    history_response = client.get("/chat/history", headers=headers)
    history = history_response.json()
    assert len(history) == 2
    assert history[1]["content"] == CRISIS_RESPONSE


@pytest.mark.integration
def test_chat_mild_mood_message_uses_mood_support_agent(client):
    headers = _register_and_login(client, email="mood2@example.com")

    response = client.post(
        "/chat",
        json={"message": "Bugün kendimi çok kötü hissediyorum, hiç motivasyonum kalmadı."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "mood_support_agent" in body["agent_used"]
    assert body["reply"] != CRISIS_RESPONSE
    assert isinstance(body["reply"], str) and body["reply"].strip() != ""
