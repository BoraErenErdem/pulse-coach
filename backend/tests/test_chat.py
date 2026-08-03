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


@pytest.mark.integration
def test_chat_uses_nutrition_knowledge_base(client):
    headers = _register_and_login(client, email="nutrition@example.com")

    response = client.post(
        "/chat",
        json={"message": "Günlük kalori ihtiyacımı nasıl hesaplarım, formülünü açıklar mısın?"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "nutrition_agent" in body["agent_used"]
    assert isinstance(body["reply"], str) and body["reply"].strip() != ""


@pytest.mark.integration
def test_chat_uses_exercise_knowledge_base(client):
    headers = _register_and_login(client, email="exercise@example.com")

    response = client.post(
        "/chat",
        json={"message": "Squat yaparken doğru form için nelere dikkat etmeliyim?"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "exercise_agent" in body["agent_used"]
    assert isinstance(body["reply"], str) and body["reply"].strip() != ""


@pytest.mark.integration
def test_chat_exercise_advice_softens_intensity_when_user_reports_fatigue(client):
    """Rekabet analizinden gelen öneri: kullanıcı yorgunluk belirtirken egzersiz
    önerisi isterse, koç yoğunluğu hafifletme/dinlenme yönünde bir ton takınmalı
    (bkz. prompts.py'deki yorgunluk/ağrı paragrafı)."""
    headers = _register_and_login(client, email="exercise-fatigue@example.com")

    response = client.post(
        "/chat",
        json={"message": "Çok yorgunum ama yine de bugün bir antrenman önerir misin?"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    reply_lower = body["reply"].lower()
    assert any(
        keyword in reply_lower
        for keyword in ("hafif", "dinlen", "azalt", "yorgun", "kısa", "düşük yoğunluk")
    )


@pytest.mark.integration
def test_chat_exercise_advice_refers_to_specialist_when_user_reports_pain(client):
    """Rekabet analizinden gelen öneri: kullanıcı bir bölgesinde ağrı belirtirse
    koç antrenmana olduğu gibi devam etmeyi önermemeli, temkinli davranmalı."""
    headers = _register_and_login(client, email="exercise-pain@example.com")

    response = client.post(
        "/chat",
        json={"message": "Dizim ağrıyor ama yine de bacak günü yapmak istiyorum, ne önerirsin?"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    reply_lower = body["reply"].lower()
    assert any(
        keyword in reply_lower
        for keyword in ("ağrı", "hafif", "dinlen", "doktor", "uzman", "sağlık profesyoneli", "dikkat")
    )


def test_chat_rate_limits_after_too_many_messages(client, monkeypatch):
    from app import chat_router
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "CHAT_MAX_ATTEMPTS", 3)
    monkeypatch.setattr(chat_router, "run_orchestrator", lambda db, user_id, message: ("ok", "orchestrator"))

    headers = _register_and_login(client, email="chat-ratelimit@example.com")

    for _ in range(3):
        response = client.post("/chat", json={"message": "merhaba"}, headers=headers)
        assert response.status_code == 200

    locked_response = client.post("/chat", json={"message": "merhaba"}, headers=headers)
    assert locked_response.status_code == 429
