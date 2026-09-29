"""Koça kişisel kalori ve makro önerisi (2026-09-29)."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.profile_agent import build_profile_tools
from app.db.base import Base
from app.models.user import User
from app.services import profile_service, progress_service
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="calorie-chat@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _recommendation_tool(session, user_id):
    return next(t for t in build_profile_tools(session, user_id) if t.name == "get_calorie_recommendation")


def test_calorie_tool_reports_missing_fields_without_numbers(db_session):
    session, user_id = db_session
    result = _recommendation_tool(session, user_id).invoke({})
    assert "hesaplanamadı" in result
    assert "boy" in result and "doğum yılı" in result and "cinsiyet" in result and "kilo" in result
    assert "Vücut Bilgilerin" in result
    assert "kcal" not in result


def test_calorie_tool_gives_personal_numbers_without_age_or_sex(db_session):
    session, user_id = db_session
    year = datetime.now(timezone.utc).year
    profile_service.apply_profile_updates(
        session, user_id, {"height_cm": 180, "birth_year": year - 30, "sex": "male", "activity_level": "moderate"}
    )
    progress_service.log_progress(session, user_id, weight=80)

    # Profilde hedef yok ama soru kilo verme üzerine: goal ile gelir.
    result = _recommendation_tool(session, user_id).invoke({"goal": "kilo vermek"})

    # test_calorie_recommendation ile aynı hesap: TDEE 2759, hedef 2260.
    assert "2260 kcal" in result and "2759" in result
    assert "130 g protein" in result and "295 g karbonhidrat" in result and "65 g yağ" in result
    assert "kilo verme" in result
    assert "yaş" not in result and "30 yaş" not in result
    assert "erkek" not in result and "male" not in result and "doğum" not in result
    # Profil hedefi değişmedi.
    profile = profile_service.get_profile(session, user_id)
    assert profile is not None and profile.goal is None


def test_calorie_tool_uses_profile_goal_by_default(db_session):
    session, user_id = db_session
    year = datetime.now(timezone.utc).year
    profile_service.apply_profile_updates(
        session,
        user_id,
        {"height_cm": 180, "birth_year": year - 30, "sex": "male", "activity_level": "moderate", "goal": "muscle_gain"},
    )
    progress_service.log_progress(session, user_id, weight=80)
    result = _recommendation_tool(session, user_id).invoke({})
    assert "kas yapma" in result and "+250 kcal" in result
