import re

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy.orm import Session
from app.agents.llm import get_llm
from app.agents.profile_agent import build_profile_tools
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.models.conversation import Conversation

_SENTENCE_END_RE = re.compile(r"[.!?…](?=\s|$)")


def _clean_truncated_reply(message: AIMessage) -> str:
    """num_predict sınırına takılıp cümle ortasında kesilen yanıtları son
    tamamlanmış cümlede düzgünce kırpar."""
    content = message.content
    if message.response_metadata.get("done_reason") != "length":
        return content

    matches = list(_SENTENCE_END_RE.finditer(content))
    if not matches:
        return content
    return content[: matches[-1].end()]


def _load_history(db: Session, user_id: int, limit: int = 20) -> list[BaseMessage]:
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.timestamp.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()

    messages: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            messages.append(HumanMessage(content=row.content))
        else:
            messages.append(AIMessage(content=row.content))
    return messages


def run_orchestrator(db: Session, user_id: int, user_message: str) -> tuple[str, str]:
    """Kullanıcı mesajını orchestrator'a iletir, yanıtı ve kullanılan agent(lar)ı döner."""
    tools = build_profile_tools(db, user_id)
    agent = create_agent(get_llm(), tools, system_prompt=ORCHESTRATOR_SYSTEM_PROMPT)

    history = _load_history(db, user_id)
    result = agent.invoke({"messages": [*history, HumanMessage(content=user_message)]})

    output_messages = result["messages"]
    tool_names_used = sorted(
        {call["name"] for msg in output_messages for call in getattr(msg, "tool_calls", None) or []}
    )
    agent_used = "profile_agent" if tool_names_used else "orchestrator"

    final_message = output_messages[-1]
    return _clean_truncated_reply(final_message), agent_used
