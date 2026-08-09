import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import mood_support_agent
from app.agents import orchestrator as orchestrator_module
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="orchestrator@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


class _RaisingAgent:
    def invoke(self, *args, **kwargs):
        raise ConnectionError("Ollama'ya bağlanılamadı")


def test_run_orchestrator_returns_fallback_when_llm_invoke_fails(db_session, monkeypatch):
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *args, **kwargs: _RaisingAgent())

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "Merhaba")

    # Profilsiz kullanıcı -> preferred_language varsayılanı "tr" (bkz.
    # UserProfile.preferred_language / profile_service.get_language).
    assert reply == orchestrator_module.LLM_ERROR_FALLBACK["tr"]
    assert agent_used == "orchestrator"


def test_run_orchestrator_returns_english_fallback_for_english_profile(db_session, monkeypatch):
    # Faz 3: preferred_language="en" olan bir kullanıcı, LLM'i hiç görmeyen
    # sabit hata mesajını da (dict[language] üzerinden) İngilizce almalı.
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, preferred_language="en"))
    session.commit()
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *args, **kwargs: _RaisingAgent())

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "Hello")

    assert reply == orchestrator_module.LLM_ERROR_FALLBACK["en"]
    assert agent_used == "orchestrator"


def test_run_orchestrator_crisis_response_respects_language(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, preferred_language="en"))
    session.commit()

    reply, agent_used = orchestrator_module.run_orchestrator(
        session, user_id, "Kendimi öldürmek istiyorum"
    )

    assert reply == mood_support_agent.CRISIS_RESPONSE_EN
    assert agent_used == "mood_support_agent"


@pytest.mark.parametrize(
    ("language", "expected"),
    [
        ("tr", mood_support_agent.CRISIS_RESPONSE_TR),
        ("en", mood_support_agent.CRISIS_RESPONSE_EN),
        ("xx", mood_support_agent.CRISIS_RESPONSE_TR),  # bilinmeyen dil -> TR'ye düşer
    ],
)
def test_get_crisis_response_selects_by_language(language, expected):
    assert mood_support_agent.get_crisis_response(language) == expected


def test_has_false_success_claim_catches_english_pattern():
    assert orchestrator_module._has_false_success_claim(
        "I've saved this workout for you, great job!", "en"
    )
    assert not orchestrator_module._has_false_success_claim(
        "I added this to your plan.", "en"
    )


def test_has_false_success_claim_catches_turkish_pattern():
    assert orchestrator_module._has_false_success_claim("Bunu kaydettim!", "tr")
    assert not orchestrator_module._has_false_success_claim("Bunu ekledim.", "tr")
