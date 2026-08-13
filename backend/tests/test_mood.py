import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.mood_support_agent import CRISIS_RESPONSE
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT, build_orchestrator_system_prompt
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.services import mood_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="mood-unit@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_log_mood_creates_new_entry(db_session):
    session, user_id = db_session
    entry = mood_service.log_mood(session, user_id, "iyi")
    assert entry.id is not None
    assert entry.mood_key == "iyi"


def test_log_mood_upserts_same_day(db_session):
    session, user_id = db_session
    first = mood_service.log_mood(session, user_id, "iyi")
    second = mood_service.log_mood(session, user_id, "zor")
    assert first.id == second.id
    assert second.mood_key == "zor"


def test_log_mood_rejects_invalid_key(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        mood_service.log_mood(session, user_id, "cok-kotu-degil-boyle-bir-sey")


def test_get_mood_returns_none_when_missing(db_session):
    session, user_id = db_session
    assert mood_service.get_mood(session, user_id) is None


def test_delete_mood_removes_entry(db_session):
    session, user_id = db_session
    mood_service.log_mood(session, user_id, "harika")
    assert mood_service.delete_mood(session, user_id) is True
    assert mood_service.get_mood(session, user_id) is None


def test_delete_mood_returns_false_when_missing(db_session):
    session, user_id = db_session
    assert mood_service.delete_mood(session, user_id) is False


def test_list_mood_history_filters_by_days(db_session):
    session, user_id = db_session
    from datetime import date, timedelta

    mood_service.log_mood(session, user_id, "iyi", log_date=date.today() - timedelta(days=10))
    mood_service.log_mood(session, user_id, "notr", log_date=date.today())

    recent = mood_service.list_mood_history(session, user_id, days=3)
    assert len(recent) == 1
    assert recent[0].mood_key == "notr"

    full = mood_service.list_mood_history(session, user_id)
    assert len(full) == 2


def test_mood_labels_en_has_same_keys_as_mood_labels():
    # Faz 3: orchestrator, language="en" iken mood_key -> MOOD_LABELS_EN
    # eşlemesine geçiyor (bkz. app/agents/orchestrator.py) - anahtar kümesi
    # MOOD_LABELS'tan (dolayısıyla VALID_MOODS'tan) sapmamalı, yoksa yeni bir
    # mood eklendiğinde İngilizce tarafta sessizce None dönebilir.
    assert set(mood_service.MOOD_LABELS_EN) == set(mood_service.MOOD_LABELS)


def test_build_orchestrator_system_prompt_without_mood_returns_base():
    # Faz 3: dil direktifi artık ORCHESTRATOR_SYSTEM_PROMPT'un İÇİNDE sabit
    # değil, build_orchestrator_system_prompt tarafından language'a göre
    # dinamik ekleniyor (bkz. app/agents/prompts.py::_language_directive) -
    # varsayılan language="tr" için TR direktifiyle birlikte base'i döner.
    assert build_orchestrator_system_prompt(None).startswith(ORCHESTRATOR_SYSTEM_PROMPT)
    assert build_orchestrator_system_prompt(None).endswith("Kullanıcıya her zaman Türkçe yanıt ver.")


def test_build_orchestrator_system_prompt_with_english_language_swaps_directive():
    # Faz 3: language="en" -> Türkçe direktif yerine İngilizce yanıt zorunluluğu
    # + RAG çevirisi talimatı gelmeli, "Türkçe yanıt ver" metni artık YOK olmalı.
    prompt = build_orchestrator_system_prompt(None, language="en")
    assert prompt.startswith(ORCHESTRATOR_SYSTEM_PROMPT)
    assert "Kullanıcıya her zaman Türkçe yanıt ver." not in prompt
    assert "İngilizce" in prompt


def test_build_orchestrator_system_prompt_with_mood_appends_disclaimer():
    prompt = build_orchestrator_system_prompt("Zor")
    assert prompt.startswith(ORCHESTRATOR_SYSTEM_PROMPT)
    assert "Zor" in prompt
    assert "kriz" in prompt.lower()
    assert "değildir" in prompt.lower() or "DEĞİLDİR" in prompt


def test_build_orchestrator_system_prompt_with_persistent_low_mood_appends_trend_note():
    prompt = build_orchestrator_system_prompt(None, persistent_low_mood=True)
    assert prompt.startswith(ORCHESTRATOR_SYSTEM_PROMPT)
    assert "tekrarlayan" in prompt.lower()
    assert "kriz" in prompt.lower()


def test_is_persistent_low_mood_false_with_no_history(db_session):
    session, user_id = db_session
    assert mood_service.is_persistent_low_mood(session, user_id) is False


def test_is_persistent_low_mood_false_below_threshold(db_session):
    from datetime import date, timedelta

    session, user_id = db_session
    mood_service.log_mood(session, user_id, "zor", log_date=date.today())
    mood_service.log_mood(session, user_id, "dusuk", log_date=date.today() - timedelta(days=1))
    mood_service.log_mood(session, user_id, "iyi", log_date=date.today() - timedelta(days=2))

    assert mood_service.is_persistent_low_mood(session, user_id) is False


def test_is_persistent_low_mood_true_at_threshold(db_session):
    from datetime import date, timedelta

    session, user_id = db_session
    mood_service.log_mood(session, user_id, "zor", log_date=date.today())
    mood_service.log_mood(session, user_id, "dusuk", log_date=date.today() - timedelta(days=1))
    mood_service.log_mood(session, user_id, "zor", log_date=date.today() - timedelta(days=2))

    assert mood_service.is_persistent_low_mood(session, user_id) is True


def test_is_persistent_low_mood_ignores_entries_outside_lookback_window(db_session):
    from datetime import date, timedelta

    session, user_id = db_session
    mood_service.log_mood(session, user_id, "zor", log_date=date.today() - timedelta(days=20))
    mood_service.log_mood(session, user_id, "dusuk", log_date=date.today() - timedelta(days=21))
    mood_service.log_mood(session, user_id, "zor", log_date=date.today() - timedelta(days=22))

    assert mood_service.is_persistent_low_mood(session, user_id, lookback_days=14) is False


def _register_and_login(client, email="mood-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_set_mood_endpoint(client):
    headers = _register_and_login(client, email="mood-api-set@example.com")
    response = client.post("/mood", json={"mood_key": "iyi"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["mood_key"] == "iyi"


def test_set_mood_endpoint_rejects_invalid_key(client):
    headers = _register_and_login(client, email="mood-api-invalid@example.com")
    response = client.post("/mood", json={"mood_key": "gecersiz"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Geçersiz ruh hali: gecersiz"


def test_set_mood_endpoint_validation_error_respects_english_preference(client):
    headers = _register_and_login(client, email="mood-api-422-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.post("/mood", json={"mood_key": "gecersiz"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid mood: gecersiz"


def test_get_today_mood_endpoint_returns_null_when_none(client):
    headers = _register_and_login(client, email="mood-api-null@example.com")
    response = client.get("/mood/today", headers=headers)
    assert response.status_code == 200
    assert response.json() is None


def test_get_today_mood_endpoint_returns_value_after_set(client):
    headers = _register_and_login(client, email="mood-api-get@example.com")
    client.post("/mood", json={"mood_key": "harika"}, headers=headers)
    response = client.get("/mood/today", headers=headers)
    assert response.json()["mood_key"] == "harika"


def test_delete_today_mood_endpoint(client):
    headers = _register_and_login(client, email="mood-api-delete@example.com")
    client.post("/mood", json={"mood_key": "notr"}, headers=headers)
    delete_response = client.delete("/mood/today", headers=headers)
    assert delete_response.status_code == 204

    get_response = client.get("/mood/today", headers=headers)
    assert get_response.json() is None


def test_delete_today_mood_endpoint_not_found_when_nothing_to_delete(client):
    """Regresyon: DELETE /mood/today önceden kayıt yokken bile hep 204
    dönüyordu - uygulamadaki DİĞER TÜM silme endpoint'leri (workouts/
    nutrition/progress/exercise_goals/photos) olmayan kaydı 404'le bildiriyor,
    mood bu deseni kırıyordu (2026-08-13 tutarlılık incelemesinde bulundu)."""
    headers = _register_and_login(client, email="mood-api-delete-404@example.com")
    response = client.delete("/mood/today", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Bugün için kaydedilmiş bir ruh hali bulunamadı."


def test_delete_today_mood_endpoint_not_found_respects_english_preference(client):
    headers = _register_and_login(client, email="mood-api-delete-404-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.delete("/mood/today", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "No mood logged for today."


def test_mood_requires_authentication(client):
    assert client.get("/mood/today").status_code == 401
    assert client.post("/mood", json={"mood_key": "iyi"}).status_code == 401


def test_mood_history_endpoint_returns_entries_in_date_order(client):
    from datetime import date, timedelta

    headers = _register_and_login(client, email="mood-api-history@example.com")
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    user_id = db.query(User).filter(User.email == "mood-api-history@example.com").first().id
    mood_service.log_mood(db, user_id, "iyi", log_date=date.today() - timedelta(days=2))
    db.close()
    client.post("/mood", json={"mood_key": "harika"}, headers=headers)

    response = client.get("/mood/history", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["mood_key"] == "iyi"
    assert body[1]["mood_key"] == "harika"


def test_mood_history_endpoint_respects_days_filter(client):
    from datetime import date, timedelta

    headers = _register_and_login(client, email="mood-api-history-days@example.com")
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    user_id = db.query(User).filter(User.email == "mood-api-history-days@example.com").first().id
    mood_service.log_mood(db, user_id, "dusuk", log_date=date.today() - timedelta(days=30))
    db.close()
    client.post("/mood", json={"mood_key": "notr"}, headers=headers)

    response = client.get("/mood/history?days=7", headers=headers)
    assert len(response.json()) == 1
    assert response.json()[0]["mood_key"] == "notr"


def test_mood_history_endpoint_requires_authentication(client):
    assert client.get("/mood/history").status_code == 401


def test_mood_history_isolated_between_users(client):
    headers_a = _register_and_login(client, email="mood-history-user-a@example.com")
    headers_b = _register_and_login(client, email="mood-history-user-b@example.com")

    client.post("/mood", json={"mood_key": "harika"}, headers=headers_a)

    response_b = client.get("/mood/history", headers=headers_b)
    assert response_b.json() == []


def test_mood_isolated_between_users(client):
    headers_a = _register_and_login(client, email="mood-user-a@example.com")
    headers_b = _register_and_login(client, email="mood-user-b@example.com")

    client.post("/mood", json={"mood_key": "harika"}, headers=headers_a)

    response_b = client.get("/mood/today", headers=headers_b)
    assert response_b.json() is None


@pytest.mark.integration
def test_chat_low_mood_does_not_trigger_crisis_response(client):
    """Kaba bir 'zor' mod seçimi başlı başına kriz şablonunu TETİKLEMEMELİ —
    kriz tespiti sadece ham mesaj metnine bakar, mood_logs tablosuna hiç
    bakmaz. Bu test gerçek Ollama ile normal bir yanıt üretildiğini doğrular."""
    headers = _register_and_login(client, email="mood-chat-low@example.com")
    client.post("/mood", json={"mood_key": "zor"}, headers=headers)

    response = client.post(
        "/chat", json={"message": "Bugün antrenmana gitmedim, biraz üzgünüm."}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] != CRISIS_RESPONSE
    assert len(body["reply"]) > 0


@pytest.mark.integration
def test_chat_suggests_professional_support_after_persistent_low_mood_trend(client):
    """Rekabet analizinden gelen öneri: son günlerde tekrarlayan bir düşük ruh
    hali örüntüsü varsa (bkz. mood_service.is_persistent_low_mood), koç bir
    sonraki destekleyici yanıtında her zamankinden daha erken bir uzmana
    danışma önerisi eklemeli."""
    from datetime import date, timedelta

    headers = _register_and_login(client, email="mood-trend@example.com")

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    user_id = db.query(User).filter(User.email == "mood-trend@example.com").first().id
    mood_service.log_mood(db, user_id, "zor", log_date=date.today() - timedelta(days=1))
    mood_service.log_mood(db, user_id, "dusuk", log_date=date.today() - timedelta(days=2))
    mood_service.log_mood(db, user_id, "zor", log_date=date.today() - timedelta(days=3))
    db.close()

    response = client.post(
        "/chat",
        json={"message": "Bugün yine kendimi kötü hissediyorum, motivasyonum yok."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] != CRISIS_RESPONSE
    reply_lower = body["reply"].lower()
    assert any(
        keyword in reply_lower
        for keyword in ("uzman", "profesyonel", "doktor", "psikolog", "terapist", "danış", "destek al")
    )


def test_crisis_message_triggers_despite_happy_mood(client):
    """Mutlu bir mod seçilmiş olsa bile gerçek bir kriz ifadesi hâlâ sabit
    şablonu tetiklemeli — mood bağlamı kriz tespitini asla bastırmamalı.
    Kriz tetiklenince Ollama'ya hiç sorulmadığı için integration değildir."""
    headers = _register_and_login(client, email="mood-chat-crisis@example.com")
    client.post("/mood", json={"mood_key": "harika"}, headers=headers)

    response = client.post(
        "/chat", json={"message": "İntihar etmeyi düşünüyorum"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == CRISIS_RESPONSE
    assert body["agent_used"] == "mood_support_agent"
