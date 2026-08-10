from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import motivation_agent
from app.agents.motivation_agent import (
    _CHECKIN_LANGUAGE_DIRECTIVE_EN,
    _CHECKIN_LANGUAGE_DIRECTIVE_TR,
    render_checkin_message,
)
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
    user = User(email="motivation@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _recording_llm(captured: dict):
    def invoke(messages):
        captured["messages"] = messages
        return SimpleNamespace(content="ok")

    return SimpleNamespace(invoke=invoke)


def test_render_checkin_message_uses_turkish_prompt_by_default(db_session, monkeypatch):
    """Regresyon: render_checkin_message() dil parametresi hiç almıyordu,
    _CHECKIN_SYSTEM_PROMPT sabit Türkçe'ydi - haftalık check-in (DB kaydı +
    e-posta) preferred_language="en" olan kullanıcılara bile HER ZAMAN
    Türkçe gidiyordu (2026-08-10 sekme mimarisi incelemesinde bulundu,
    Faz 3 sadece interaktif sohbeti kapsamıştı)."""
    session, user_id = db_session
    captured: dict = {}
    monkeypatch.setattr(motivation_agent, "get_llm", lambda: _recording_llm(captured))

    render_checkin_message(session, user_id)

    system_message = captured["messages"][0]
    assert system_message.content.endswith(_CHECKIN_LANGUAGE_DIRECTIVE_TR)
    assert _CHECKIN_LANGUAGE_DIRECTIVE_EN not in system_message.content


def test_render_checkin_message_uses_english_directive_for_english_profile(db_session, monkeypatch):
    """Regresyon: ilk deneme (tamamen ayrı TR/EN sistem promptu) SAFETY_RULES'un
    kendisi Türkçe olduğu için gerçek LLM'i EN kullanıcı için bile Türkçe
    yanıt vermeye itiyordu (canlı testte bulundu) - kanıtlanmış çözüm
    prompts.py::build_orchestrator_system_prompt'taki AYNI desen: base
    prompt Türkçe kalır, en SONA güçlü bir dil direktifi eklenir."""
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, preferred_language="en"))
    session.commit()
    captured: dict = {}
    monkeypatch.setattr(motivation_agent, "get_llm", lambda: _recording_llm(captured))

    render_checkin_message(session, user_id)

    system_message = captured["messages"][0]
    assert system_message.content.endswith(_CHECKIN_LANGUAGE_DIRECTIVE_EN)
    # Insan mesajı (haftalık özet) de İngilizce olmalı - as_text(language) doğru geçirilmiş.
    human_message = captured["messages"][1]
    assert "No progress was logged" in human_message.content
