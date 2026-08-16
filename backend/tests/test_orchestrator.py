import pytest
from langchain_core.messages import AIMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import mood_support_agent
from app.agents import orchestrator as orchestrator_module
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import conversation_service


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


def test_run_orchestrator_passes_coach_tone_into_system_prompt(db_session, monkeypatch):
    """Regresyon: coach_tone önceden SADECE push/check-in mesajlarını
    etkiliyordu, interaktif sohbet (run_orchestrator) hiç kullanmıyordu -
    kullanıcı fark edip sordu (2026-08-13). Kullanıcının seçtiği ton artık
    sohbetin system prompt'una da geçmeli."""
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, coach_tone="enerjik"))
    session.commit()

    captured_system_prompts = []

    def _capture_create_agent(*args, **kwargs):
        captured_system_prompts.append(kwargs.get("system_prompt"))
        return _RaisingAgent()

    monkeypatch.setattr(orchestrator_module, "create_agent", _capture_create_agent)

    orchestrator_module.run_orchestrator(session, user_id, "Merhaba")

    assert len(captured_system_prompts) == 1
    assert "Ton: Enerjik ve coşkulu ol" in captured_system_prompts[0]


class _CapturingAgent:
    """create_agent() yerine kullanılıp .invoke()'a giden `messages` listesini
    (history + yeni kullanıcı mesajı) yakalar, gerçek LLM'e hiç gitmez."""

    def __init__(self, sink):
        self._sink = sink

    def invoke(self, payload, config=None):
        self._sink.append(list(payload["messages"]))
        return {"messages": [AIMessage(content="tamam")]}


def test_run_orchestrator_excludes_history_before_soft_clear(db_session, monkeypatch):
    """"Sohbeti Sıfırla" koçun bağlamını da temizlemeli - aksi halde ekranda
    "temiz sayfa" gösterip arka planda eski konuya devam ediyormuş gibi
    cevap verirdi (bkz. conversation_service.get_cleared_at,
    orchestrator._load_history)."""
    session, user_id = db_session
    conversation_service.save_turn(session, user_id, "eski mesaj", "eski cevap", "orchestrator")
    conversation_service.soft_clear(session, user_id)
    conversation_service.save_turn(session, user_id, "yeni mesaj", "yeni cevap", "orchestrator")

    captured: list[list] = []
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _CapturingAgent(captured))

    orchestrator_module.run_orchestrator(session, user_id, "devam ediyoruz")

    assert len(captured) == 1
    history_contents = [msg.content for msg in captured[0][:-1]]  # son eleman az önce eklenen kullanıcı mesajı
    assert "eski mesaj" not in history_contents
    assert "eski cevap" not in history_contents
    assert "yeni mesaj" in history_contents
    assert "yeni cevap" in history_contents


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
