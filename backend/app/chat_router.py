from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.agents.orchestrator import run_orchestrator
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.conversation import ChatRequest, ChatResponse, ConversationRead

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reply, agent_used = run_orchestrator(db, current_user.id, payload.message)

    db.add(Conversation(user_id=current_user.id, role="user", content=payload.message))
    db.add(
        Conversation(
            user_id=current_user.id, role="assistant", content=reply, agent_used=agent_used
        )
    )
    db.commit()

    return ChatResponse(reply=reply, agent_used=agent_used)


@router.get("/history", response_model=list[ConversationRead])
def history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.timestamp.asc())
        .all()
    )
