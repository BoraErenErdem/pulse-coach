import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.profile_agent import build_profile_tools
from app.db.base import Base
from app.models.user import User
from app.services import profile_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="profile-svc@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_get_profile_returns_none_when_missing(db_session):
    session, user_id = db_session
    assert profile_service.get_profile(session, user_id) is None


def test_update_profile_creates_profile_if_missing(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(session, user_id, target_weight_kg=80)
    assert profile.id is not None
    assert profile.target_weight_kg == 80


def test_get_coach_tone_defaults_to_notr_when_profile_missing(db_session):
    session, user_id = db_session
    assert profile_service.get_coach_tone(session, user_id) == "notr"


def test_get_coach_tone_defaults_to_notr_when_never_set(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, target_weight_kg=80)
    assert profile_service.get_coach_tone(session, user_id) == "notr"


def test_update_profile_sets_valid_coach_tone(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(session, user_id, coach_tone="sicak")
    assert profile.coach_tone == "sicak"
    assert profile_service.get_coach_tone(session, user_id) == "sicak"


def test_update_profile_rejects_invalid_coach_tone(db_session):
    import pytest as _pytest
    from app.exceptions import AppValidationError

    session, user_id = db_session
    with _pytest.raises(AppValidationError):
        profile_service.update_profile(session, user_id, coach_tone="gecersiz-ton")


def test_apply_profile_updates_sets_valid_coach_tone(db_session):
    session, user_id = db_session
    profile = profile_service.apply_profile_updates(session, user_id, {"coach_tone": "enerjik"})
    assert profile.coach_tone == "enerjik"


def test_apply_profile_updates_rejects_invalid_coach_tone(db_session):
    import pytest as _pytest
    from app.exceptions import AppValidationError

    session, user_id = db_session
    with _pytest.raises(AppValidationError):
        profile_service.apply_profile_updates(session, user_id, {"coach_tone": "gecersiz-ton"})


# 2026-09-11 güvenlik taraması: hedef kilo/kalori/makro alanlarında HİÇBİR
# sayısal sınır kontrolü yoktu - negatif bir kalori hedefi sessizce
# kaydedilebiliyordu (bkz. exceptions.py + profile_service._validate_goal_numbers
# aynı tarihli notlar).
def test_update_profile_rejects_negative_calorie_goal(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, daily_calorie_goal=-500)


def test_update_profile_rejects_negative_target_weight(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, target_weight_kg=-10)


def test_apply_profile_updates_rejects_out_of_range_macro_goal(db_session):
    import pytest as _pytest
    from app.exceptions import AppValidationError

    session, user_id = db_session
    with _pytest.raises(AppValidationError):
        profile_service.apply_profile_updates(session, user_id, {"daily_protein_goal_g": -50})


def test_update_profile_only_changes_given_fields(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, goal="weight_loss", target_weight_kg=75)
    updated = profile_service.update_profile(session, user_id, target_weight_kg=70)
    assert updated.goal == "weight_loss"
    assert updated.target_weight_kg == 70


def test_update_profile_rejects_invalid_goal(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, goal="become_a_bird")


def test_update_profile_rejects_invalid_activity_level(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, activity_level="extremely_hyperactive")


def test_update_user_profile_tool_matches_uppercase_turkish_i_phrases(db_session):
    """Regresyon: profile_agent._normalize düz .lower() kullanıyordu -
    "AKTİF"/"SAĞLIKLI YAŞAM" gibi büyük harfli Türkçe ifadeler
    (Python'un .lower()'ı "İ"yi/"I"yı yanlış çevirdiği için) anahtar
    kelimelerle asla eşleşmiyor, tool sessizce "net anlaşılamadı" uyarısı
    üretip profili güncellemiyordu (bkz. proje belleği, 2026-08-10 pürüz
    taraması)."""
    session, user_id = db_session
    tools = build_profile_tools(session, user_id)
    update_tool = next(t for t in tools if t.name == "update_user_profile")

    result = update_tool.invoke({"goal": "SAĞLIKLI YAŞAM", "activity_level": "AKTİF"})

    assert "net anlaşılamadı" not in result
    profile = profile_service.get_profile(session, user_id)
    assert profile.goal == "general_health"
    assert profile.activity_level == "active"


def test_update_profile_defaults_preferred_language_to_tr(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(session, user_id, target_weight_kg=80)
    assert profile.preferred_language == "tr"


def test_update_profile_sets_preferred_language(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(session, user_id, preferred_language="en")
    assert profile.preferred_language == "en"


def test_update_profile_rejects_invalid_language(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        profile_service.update_profile(session, user_id, preferred_language="fr")


def test_get_language_defaults_to_tr_when_no_profile(db_session):
    session, user_id = db_session
    assert profile_service.get_language(session, user_id) == "tr"


def test_get_language_returns_preferred_language(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, preferred_language="en")
    assert profile_service.get_language(session, user_id) == "en"


def test_update_profile_sets_nutrition_goals(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(
        session, user_id, daily_calorie_goal=2000, daily_protein_goal_g=150
    )
    assert profile.daily_calorie_goal == 2000
    assert profile.daily_protein_goal_g == 150


def _register_and_login(client, email="profile-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password, "kvkk_consent": True, "health_data_consent": True, "terms_consent": True})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_profile_endpoint_returns_empty_defaults(client):
    headers = _register_and_login(client, email="profile-api-get@example.com")
    response = client.get("/profile", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["goal"] is None
    assert body["target_weight_kg"] is None
    assert body["preferred_language"] == "tr"


def test_patch_profile_endpoint_updates_preferred_language(client):
    headers = _register_and_login(client, email="profile-api-lang@example.com")
    response = client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "en"

    get_response = client.get("/profile", headers=headers)
    assert get_response.json()["preferred_language"] == "en"


def test_patch_profile_endpoint_rejects_invalid_language(client):
    headers = _register_and_login(client, email="profile-api-lang-invalid@example.com")
    response = client.patch("/profile", json={"preferred_language": "de"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Geçersiz dil tercihi: de"


def test_patch_profile_endpoint_updates_fields(client):
    headers = _register_and_login(client, email="profile-api-put@example.com")
    response = client.patch(
        "/profile",
        json={"goal": "muscle_gain", "target_weight_kg": 85, "daily_calorie_goal": 2500},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["goal"] == "muscle_gain"
    assert body["target_weight_kg"] == 85
    assert body["daily_calorie_goal"] == 2500


def test_patch_profile_endpoint_updates_coach_tone(client):
    headers = _register_and_login(client, email="profile-api-coach-tone@example.com")
    response = client.patch("/profile", json={"coach_tone": "enerjik"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["coach_tone"] == "enerjik"


def test_patch_profile_endpoint_rejects_invalid_coach_tone(client):
    headers = _register_and_login(client, email="profile-api-invalid-tone@example.com")
    response = client.patch("/profile", json={"coach_tone": "not_a_real_tone"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Geçersiz koç tonu: not_a_real_tone"


def test_patch_profile_endpoint_rejects_invalid_goal(client):
    headers = _register_and_login(client, email="profile-api-invalid@example.com")
    response = client.patch("/profile", json={"goal": "not_a_real_goal"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Geçersiz hedef: not_a_real_goal"


def test_patch_profile_endpoint_rejects_negative_calorie_goal(client):
    headers = _register_and_login(client, email="profile-api-neg-calorie@example.com")
    response = client.patch("/profile", json={"daily_calorie_goal": -500}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Günlük kalori hedefi 0 ile 10000 kcal arasında olmalı."
    # Reddedilen istek hiçbir şeyi kalıcı olarak DEĞİŞTİRMEMİŞ olmalı.
    assert client.get("/profile", headers=headers).json()["daily_calorie_goal"] is None


def test_patch_profile_endpoint_rejects_out_of_range_target_weight(client):
    headers = _register_and_login(client, email="profile-api-bad-weight@example.com")
    response = client.patch("/profile", json={"target_weight_kg": -10}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Kilo 0 ile 500 kg arasında olmalı."


def test_patch_profile_endpoint_validation_error_respects_english_preference(client):
    """Regresyon: hata mesajının dili GÜNCELLEMEDEN ÖNCEKİ (geçerli)
    preferred_language'a göre seçilmeli - kullanıcı geçersiz bir değer
    gönderse bile mevcut tercihine göre bir mesaj alır."""
    headers = _register_and_login(client, email="profile-api-422-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.patch("/profile", json={"goal": "not_a_real_goal"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid goal: not_a_real_goal"


def test_profile_requires_authentication(client):
    response = client.get("/profile")
    assert response.status_code == 401


@pytest.mark.integration
def test_chat_sets_target_weight_via_tool_call(client):
    headers = _register_and_login(client, email="profile-chat@example.com")
    response = client.post(
        "/chat", json={"message": "85 kiloya inmek istiyorum, bunu hedef kilo olarak kaydeder misin?"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert "profile_agent" in body["agent_used"]

    profile_response = client.get("/profile", headers=headers)
    assert profile_response.json()["target_weight_kg"] == 85


# ---- 2026-09-19: bel çevresi / vücut yağ oranı hedefleri (İlerleme sekmesi)
def test_patch_profile_endpoint_sets_and_clears_waist_and_body_fat_goals(client):
    headers = _register_and_login(client, email="profile-api-waist-fat@example.com")
    response = client.patch(
        "/profile", json={"target_waist_cm": 85.5, "target_body_fat_pct": 18}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target_waist_cm"] == 85.5
    assert body["target_body_fat_pct"] == 18
    # Sadece biri null'a çekilince diğerine dokunulmaz.
    cleared = client.patch("/profile", json={"target_waist_cm": None}, headers=headers).json()
    assert cleared["target_waist_cm"] is None
    assert cleared["target_body_fat_pct"] == 18


def test_get_profile_endpoint_returns_null_waist_and_body_fat_goals_by_default(client):
    headers = _register_and_login(client, email="profile-api-waist-fat-empty@example.com")
    body = client.get("/profile", headers=headers).json()
    assert body["target_waist_cm"] is None
    assert body["target_body_fat_pct"] is None


@pytest.mark.parametrize(
    "field,value,expected_detail",
    [
        ("target_waist_cm", -5, "Bel çevresi 0 ile 300 cm arasında olmalı."),
        ("target_waist_cm", 400, "Bel çevresi 0 ile 300 cm arasında olmalı."),
        ("target_body_fat_pct", 0, "Vücut yağ oranı 0 ile 100 arasında olmalı."),
        ("target_body_fat_pct", 120, "Vücut yağ oranı 0 ile 100 arasında olmalı."),
    ],
)
def test_patch_profile_endpoint_rejects_out_of_range_waist_and_body_fat_goals(client, field, value, expected_detail):
    headers = _register_and_login(client, email=f"profile-api-bad-{field}-{value}@example.com")
    response = client.patch("/profile", json={field: value}, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == expected_detail
    # Reddedilen istek hiçbir şeyi kalıcı olarak DEĞİŞTİRMEMİŞ olmalı.
    assert client.get("/profile", headers=headers).json()[field] is None


# ---- 2026-09-19: sohbet ajanı (profile_agent) bel/yağ hedeflerini de kaydeder
def test_update_user_profile_tool_sets_waist_and_body_fat_goals(db_session):
    session, user_id = db_session
    tools = build_profile_tools(session, user_id)
    update_tool = next(t for t in tools if t.name == "update_user_profile")
    get_tool = next(t for t in tools if t.name == "get_user_profile")

    result = update_tool.invoke({"target_waist_cm": 85, "target_body_fat_pct": 18})

    assert "Hedef bel çevresi: 85" in result
    assert "Hedef vücut yağ oranı: %18" in result
    profile = profile_service.get_profile(session, user_id)
    assert profile.target_waist_cm == 85
    assert profile.target_body_fat_pct == 18
    # get_user_profile de yeni alanları gösteriyor.
    fetched = get_tool.invoke({})
    assert "Hedef bel çevresi: 85" in fetched
    assert "Hedef vücut yağ oranı: %18" in fetched


def test_update_user_profile_tool_leaves_other_goals_untouched(db_session):
    session, user_id = db_session
    profile_service.update_profile(session, user_id, target_weight_kg=80, target_waist_cm=90)
    tools = build_profile_tools(session, user_id)
    update_tool = next(t for t in tools if t.name == "update_user_profile")

    update_tool.invoke({"target_body_fat_pct": 20})

    profile = profile_service.get_profile(session, user_id)
    assert profile.target_weight_kg == 80
    assert profile.target_waist_cm == 90
    assert profile.target_body_fat_pct == 20


@pytest.mark.parametrize(
    "field,value,code",
    [
        ("target_waist_cm", -1, "waist_out_of_range"),
        ("target_waist_cm", 301, "waist_out_of_range"),
        ("target_body_fat_pct", 0, "body_fat_out_of_range"),
        ("target_body_fat_pct", 101, "body_fat_out_of_range"),
    ],
)
def test_update_profile_rejects_out_of_range_waist_and_body_fat_goals(db_session, field, value, code):
    from app.exceptions import AppValidationError

    session, user_id = db_session
    with pytest.raises(AppValidationError) as excinfo:
        profile_service.update_profile(session, user_id, **{field: value})
    assert excinfo.value.code == code
    # Reddedilen çağrı profil satırını oluşturmamış/değiştirmemiş olmalı.
    profile = profile_service.get_profile(session, user_id)
    assert profile is None or getattr(profile, field) is None


@pytest.mark.integration
def test_chat_sets_target_waist_via_tool_call(client):
    headers = _register_and_login(client, email="profile-chat-waist@example.com")
    response = client.post(
        "/chat", json={"message": "Belimi 85 cm'ye indirmek istiyorum, bunu hedef bel çevresi olarak kaydeder misin?"}, headers=headers
    )
    assert response.status_code == 200
    assert "profile_agent" in response.json()["agent_used"]
    assert client.get("/profile", headers=headers).json()["target_waist_cm"] == 85


@pytest.mark.integration
def test_chat_sets_target_body_fat_via_tool_call(client):
    headers = _register_and_login(client, email="profile-chat-fat@example.com")
    response = client.post(
        "/chat", json={"message": "Vücut yağ oranımı %18'e düşürmek istiyorum, bunu hedefim olarak kaydeder misin?"}, headers=headers
    )
    assert response.status_code == 200
    assert "profile_agent" in response.json()["agent_used"]
    assert client.get("/profile", headers=headers).json()["target_body_fat_pct"] == 18


@pytest.mark.integration
def test_chat_sets_weight_and_waist_goals_in_one_message(client):
    headers = _register_and_login(client, email="profile-chat-combined@example.com")
    response = client.post(
        "/chat", json={"message": "Hedef kilom 82, hedef belim 88 cm olsun, kaydeder misin?"}, headers=headers
    )
    assert response.status_code == 200
    profile = client.get("/profile", headers=headers).json()
    assert profile["target_weight_kg"] == 82
    assert profile["target_waist_cm"] == 88


@pytest.mark.integration
def test_chat_measurement_is_not_saved_as_a_goal(client):
    """Regresyon: "belim 92 cm ölçüldü" bir ÖLÇÜM, hedef değil - profil ajanı
    devreye girip hedef bel/yağ alanlarını doldurmamalı (takip ajanına gider)."""
    headers = _register_and_login(client, email="profile-chat-measure@example.com")
    response = client.post(
        "/chat", json={"message": "Bugün belim 92 cm ölçüldü, yağ oranım %20 çıktı."}, headers=headers
    )
    assert response.status_code == 200
    profile = client.get("/profile", headers=headers).json()
    assert profile["target_waist_cm"] is None
    assert profile["target_body_fat_pct"] is None
