import re
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy.orm import Session
from app.agents.exercise_agent import build_exercise_tools
from app.agents.llm import get_llm
from app.agents.motivation_agent import build_motivation_tools
from app.agents.nutrition_agent import build_nutrition_tools
from app.agents.profile_agent import build_profile_tools
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.agents.tracking_agent import build_tracking_tools
from app.models.conversation import Conversation

_SENTENCE_END_RE = re.compile(r"[.!?…](?=\s|$)")

_TOOL_TO_AGENT = {
    "get_user_profile": "profile_agent",
    "update_user_profile": "profile_agent",
    "search_nutrition_knowledge": "nutrition_agent",
    "search_exercise_knowledge": "exercise_agent",
    "log_progress": "tracking_agent",
    "get_weekly_summary": "tracking_agent",
    "generate_encouragement": "motivation_agent",
    "generate_checkin_message": "motivation_agent",
}


def _resolve_agent_used(tool_names: set[str]) -> str:
    agents_used = sorted({_TOOL_TO_AGENT[name] for name in tool_names if name in _TOOL_TO_AGENT})
    return "+".join(agents_used) if agents_used else "orchestrator"


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
    tools = [
        *build_profile_tools(db, user_id),
        *build_nutrition_tools(),
        *build_exercise_tools(),
        *build_tracking_tools(db, user_id),
        *build_motivation_tools(db, user_id),
    ]
    agent = create_agent(get_llm(), tools, system_prompt=ORCHESTRATOR_SYSTEM_PROMPT)

    history = _load_history(db, user_id)
    result = agent.invoke({"messages": [*history, HumanMessage(content=user_message)]})

    output_messages = result["messages"]
    tool_names_used = {
        call["name"] for msg in output_messages for call in getattr(msg, "tool_calls", None) or []
    }
    agent_used = _resolve_agent_used(tool_names_used)

    final_message = output_messages[-1]
    return _clean_truncated_reply(final_message), agent_used
