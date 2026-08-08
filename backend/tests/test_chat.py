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


@pytest.mark.integration
def test_chat_logs_correct_set_count_for_nx_sirasiyla_pattern(client):
    """Regresyon testi — bkz. feedback_llm_tuning_health_coach.md 'Takip 5'.
    'Nx10 sırasıyla A, B, C' kalıbında (çarpım öneki + virgüllü FARKLI ağırlık
    listesi) model önceden 'Nx' önekindeki N'i set_count sanıp 3 farklı seti
    3'er kez çoğaltıyordu (3 set → 9 set). Docstring düzeltmesi (commit
    e46d449, `ExerciseSetItem.set_count` + `log_exercise_sets_bulk`) sonrası
    TAM OLARAK 3 farklı set beklenir — kanıt: eski oturumlarda bu düzeltme
    sonrası çalıştırılan 11 test koşusunun 11'inde de doğru (bkz.
    project_health_coach_status.md, 2026-08-08 doctor turu). Bu test o
    kanıtı kalıcı bir kontrol noktasına bağlıyor."""
    headers = _register_and_login(client, email="setcount-nx@example.com")

    response = client.post(
        "/chat",
        json={"message": "arka omuz için 3x10 sırasıyla 55kg, 60kg ve 65kg yaptım."},
        headers=headers,
    )
    assert response.status_code == 200

    sessions = client.get("/workouts/sessions", headers=headers).json()
    total_sets = sum(len(session["sets"]) for session in sessions)
    assert total_sets == 3, (
        f"'3x10 sırasıyla' 3 farklı set olarak kaydedilmeli, {total_sets} kaydedildi "
        "(9 ise 'Nx' önekini set_count sanma bug'ı geri gelmiş demektir)."
    )


@pytest.mark.integration
def test_chat_logs_correct_set_count_for_drop_set_pattern(client):
    """Regresyon testi — bkz. feedback_llm_tuning_health_coach.md. Drop-set
    kalıbında ('Nx[tekrar] A, B, C ile drop yaptım') set sayısı 'Nx'
    önekindeki N'dir, listelenen ağırlık SAYISI değil. Eski oturumda 1/11
    koşuda model ağırlık sayısını (3) set sayısı sandı, 4 yerine 3 set
    kaydetti (undercounting) — docstring'e ('drop-set'e özel undercounting
    hatası' uyarısı) buna karşı açık örnek eklendi."""
    headers = _register_and_login(client, email="setcount-drop@example.com")

    response = client.post(
        "/chat",
        json={"message": "lateral için 4x20 12kg, 10kg ve 7kg ile drop yaptım."},
        headers=headers,
    )
    assert response.status_code == 200

    sessions = client.get("/workouts/sessions", headers=headers).json()
    total_sets = sum(len(session["sets"]) for session in sessions)
    assert total_sets == 4, (
        f"'4x20 ... ile drop yaptım' 4 set olarak kaydedilmeli, {total_sets} kaydedildi "
        "('Nx' önekindeki N yerine ağırlık sayısı kullanılmış olabilir)."
    )


@pytest.mark.integration
def test_chat_logs_correct_set_count_for_mixed_group_pattern(client):
    """Regresyon testi — bkz. feedback_llm_tuning_health_coach.md. Aynı
    cümlede aynı egzersiz için iki ayrı grup art arda gelebilir (önce
    tekrarlı bir grup, sonra tek başına farklı bir set). Eski oturumda 3/11
    koşuda ilk grubun 2 seti sessizce kayboluyordu (4 yerine 2 set) —
    docstring'e bu bileşik-cümle kalıbı için açık örnek eklendi."""
    headers = _register_and_login(client, email="setcount-mixed@example.com")

    response = client.post(
        "/chat",
        json={
            "message": (
                "ön omuz için front raise hareketinde 12kg ile 3x10, "
                "sonrasında 15kg ile 8 tekrar attım."
            )
        },
        headers=headers,
    )
    assert response.status_code == 200

    sessions = client.get("/workouts/sessions", headers=headers).json()
    total_sets = sum(len(session["sets"]) for session in sessions)
    assert total_sets == 4, (
        f"'12kg ile 3x10, sonrasında 15kg ile 8 tekrar' 4 set olarak kaydedilmeli, "
        f"{total_sets} kaydedildi (ilk grubun tekrarlı setleri kaybolmuş olabilir)."
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
