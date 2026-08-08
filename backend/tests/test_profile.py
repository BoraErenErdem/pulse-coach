import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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


def test_update_profile_sets_nutrition_goals(db_session):
    session, user_id = db_session
    profile = profile_service.update_profile(
        session, user_id, daily_calorie_goal=2000, daily_protein_goal_g=150
    )
    assert profile.daily_calorie_goal == 2000
    assert profile.daily_protein_goal_g == 150


def _register_and_login(client, email="profile-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
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


def test_patch_profile_endpoint_rejects_invalid_goal(client):
    headers = _register_and_login(client, email="profile-api-invalid@example.com")
    response = client.patch("/profile", json={"goal": "not_a_real_goal"}, headers=headers)
    assert response.status_code == 422


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
