"""Akışlı sohbet (2026-09-26): orchestrator.ChatStream ve POST /chat/stream."""

import json
import uuid
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from sqlalchemy.orm import sessionmaker

from app.agents import orchestrator as orchestrator_module
from app.agents.orchestrator import ChatStream, _DraftState
from app.db.base import Base
from app.models.user import User
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    user = User(email="stream@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    try:
        yield session, user.id
    finally:
        session.close()


class _ScriptedAgent:
    """Gerçek ajanın geri çağırma sırasını taklit eder: araç çağıran bir model
    turu (taslak metinle), araç, ardından parça parça son yanıt."""

    def __init__(self, final_tokens: list[str], pre_tool_text: str = "Hemen bakıyorum", tool_status: str = "success"):
        self.final_tokens = final_tokens
        self.pre_tool_text = pre_tool_text
        self.tool_status = tool_status
        self.config: dict = {}

    def invoke(self, inputs, config):
        self.config = config
        cb = config["callbacks"][0]
        first, second, tool_run = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        tool_call = {"name": "log_exercise_set", "args": {}, "id": "c1"}

        cb.on_chat_model_start({}, [], run_id=first, metadata={"langgraph_node": "model"})
        cb.on_llm_new_token(self.pre_tool_text, chunk=None, run_id=first)
        first_msg = AIMessage(content=self.pre_tool_text, tool_calls=[tool_call])
        cb.on_llm_end(SimpleNamespace(generations=[[SimpleNamespace(message=first_msg)]]), run_id=first)

        cb.on_tool_start({"name": "log_exercise_set"}, "{}", run_id=tool_run)
        # Araç içindeki başka bir LLM çağrısı taslağa karışmamalı.
        inner = uuid.uuid4()
        cb.on_chat_model_start({}, [], run_id=inner, metadata={"langgraph_node": "tools"})
        cb.on_llm_new_token("İÇ MODEL", chunk=None, run_id=inner)
        tool_msg = ToolMessage(content="ok", tool_call_id="c1", name="log_exercise_set", status=self.tool_status)
        cb.on_tool_end(tool_msg, run_id=tool_run, name="log_exercise_set")

        cb.on_chat_model_start({}, [], run_id=second, metadata={"langgraph_node": "model"})
        for token in self.final_tokens:
            cb.on_llm_new_token(token, chunk=None, run_id=second)
        final = AIMessage(content="".join(self.final_tokens), response_metadata={"done_reason": "stop"})
        cb.on_llm_end(SimpleNamespace(generations=[[SimpleNamespace(message=final)]]), run_id=second)
        return {"messages": [*inputs["messages"], first_msg, tool_msg, final]}


def _collect(stream: ChatStream) -> list[dict]:
    return list(stream.events())


def test_stream_emits_tool_reset_tokens_and_final_reply(db_session, monkeypatch):
    session, user_id = db_session
    agent = _ScriptedAgent(["3 set ", "kaydettim. ", "Harika gidiyorsun!"])
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    events = _collect(ChatStream(session, user_id, "3 set bench yaptım"))
    kinds = [e["type"] for e in events]

    assert kinds[0] == "token"  # araç öncesi taslak
    assert "reset" in kinds and kinds.index("reset") < kinds.index("tool")
    assert events[kinds.index("tool")]["label"] == "Antrenmanın kaydediliyor"
    draft = "".join(e["text"] for e in events[kinds.index("tool") :] if e["type"] == "token")
    assert "İÇ MODEL" not in draft
    assert events[-1] == {"type": "done", "reply": "3 set kaydettim. Harika gidiyorsun!", "agent_used": "workout_tracking_agent"}
    assert draft == events[-1]["reply"]
    # /chat ile aynı güvenli ayar: araçlar sırayla (paylaşılan DB oturumu).
    assert agent.config["max_concurrency"] == 1


def test_false_save_claim_is_not_streamed_when_write_tool_failed(db_session, monkeypatch):
    session, user_id = db_session
    agent = _ScriptedAgent(["Tamam, ", "kaydettim!"], pre_tool_text="", tool_status="error")
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    events = _collect(ChatStream(session, user_id, "3 set bench yaptım"))
    draft = "".join(e["text"] for e in events if e["type"] == "token")

    assert "kaydettim" not in draft
    assert events[-1]["reply"] == orchestrator_module.EMPTY_REPLY_NO_TOOLS_FALLBACK["tr"]


def test_stream_falls_back_when_agent_fails(db_session, monkeypatch):
    session, user_id = db_session

    class _Raising:
        def invoke(self, *a, **kw):
            raise ConnectionError("Ollama yok")

    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _Raising())
    events = _collect(ChatStream(session, user_id, "Merhaba"))
    assert events == [{"type": "done", "reply": orchestrator_module.LLM_ERROR_FALLBACK["tr"], "agent_used": "orchestrator"}]


def test_crisis_message_never_reaches_the_model(db_session, monkeypatch):
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: pytest.fail("LLM çağrılmamalı"))
    monkeypatch.setattr(orchestrator_module, "check_crisis_indicators", lambda message: True)
    events = _collect(ChatStream(session, user_id, "..."))
    assert len(events) == 1 and events[0]["type"] == "done" and events[0]["agent_used"] == "mood_support_agent"


def test_draft_stops_at_sentence_cap_so_final_only_appends():
    draft = _DraftState(max_sentences=2, language="tr")
    sent = draft.push("Bir. İki. ") + draft.push("Üç cümle burada.")
    assert sent == "Bir. İki."
    assert draft.push("Dört.") == ""


def test_draft_reset_reports_whether_text_was_shown():
    draft = _DraftState(max_sentences=5, language="tr")
    assert draft.reset() is False
    draft.push("Bakıyorum")
    assert draft.reset() is True
    assert draft.push("Yeni") == "Yeni"


def _register_and_login(client, email):
    client.post(
        "/auth/register",
        json={"email": email, "password": "supersecret", "kvkk_consent": True, "health_data_consent": True, "terms_consent": True},
    )
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_stream_endpoint_sends_sse_and_saves_turn(client, monkeypatch):
    agent = _ScriptedAgent(["Kaydettim, ", "süper!"])
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)
    headers = _register_and_login(client, "stream-api@example.com")

    with client.stream("POST", "/chat/stream", json={"message": "3 set bench"}, headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        lines = [line for line in response.iter_lines() if line.startswith("data: ")]
    events = [json.loads(line[len("data: ") :]) for line in lines]

    assert events[-1]["type"] == "done"
    assert events[-1]["reply"] == "Kaydettim, süper!"
    history = client.get("/chat/history", headers=headers).json()
    assert [m["role"] for m in history][-2:] == ["user", "assistant"]
    assert history[-1]["content"] == "Kaydettim, süper!"


def test_stream_endpoint_is_rate_limited_like_chat(client, monkeypatch):
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "CHAT_MAX_ATTEMPTS", 1)
    agent = _ScriptedAgent(["Tamam."])
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)
    headers = _register_and_login(client, "stream-limit@example.com")

    first = client.post("/chat/stream", json={"message": "a"}, headers=headers)
    assert first.status_code == 200
    second = client.post("/chat/stream", json={"message": "b"}, headers=headers)
    assert second.status_code == 429

