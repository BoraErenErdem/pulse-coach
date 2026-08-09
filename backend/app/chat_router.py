from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.agents.orchestrator import run_orchestrator
from app.auth import rate_limit
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.conversation import ChatRequest, ChatResponse, ConversationRead
from app.services import profile_service

router = APIRouter(prefix="/chat", tags=["chat"])

# Faz 3: rate-limit hatası run_orchestrator/LLM'in hiç görmediği, doğrudan
# HTTPException ile dönen bir mesaj — bu yüzden orchestrator'daki dict[language]
# deseniyle aynı şekilde burada da ayrı tutuluyor.
_RATE_LIMIT_MESSAGES = {
    "tr": "Çok fazla mesaj gönderildi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many messages sent. Please try again in {minutes} minutes.",
}


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if rate_limit.is_locked_out(
        db, current_user.email, bucket="chat", max_attempts=rate_limit.CHAT_MAX_ATTEMPTS
    ):
        language = profile_service.get_language(db, current_user.id)
        detail = _RATE_LIMIT_MESSAGES[language].format(minutes=rate_limit.WINDOW_MINUTES)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
    rate_limit.record_failed_attempt(db, current_user.email, bucket="chat")

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
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Conversation).filter(Conversation.user_id == current_user.id)
    if limit is not None:
        rows = query.order_by(Conversation.timestamp.desc()).limit(limit).all()
        return list(reversed(rows))
    return query.order_by(Conversation.timestamp.asc()).all()
