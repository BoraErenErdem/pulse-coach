import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import orchestrator as orchestrator_module
from app.db.base import Base
from app.models.user import User


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

    assert reply == orchestrator_module.LLM_ERROR_FALLBACK
    assert agent_used == "orchestrator"
