import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.agents.orchestrator import ChatStream, run_orchestrator
from app.auth import rate_limit
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.conversation import ChatRequest, ChatResponse, ConversationRead
from app.services import conversation_service, profile_service

router = APIRouter(prefix="/chat", tags=["chat"])

# Faz 3: rate-limit hatası run_orchestrator/LLM'in hiç görmediği, doğrudan
# HTTPException ile dönen bir mesaj — bu yüzden orchestrator'daki dict[language]
# deseniyle aynı şekilde burada da ayrı tutuluyor.
_RATE_LIMIT_MESSAGES = {
    "tr": "Çok fazla mesaj gönderildi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many messages sent. Please try again in {minutes} minutes.",
}


def _enforce_chat_rate_limit(db: Session, current_user: User) -> None:
    if rate_limit.is_locked_out(
        db, current_user.email, bucket="chat", max_attempts=rate_limit.CHAT_MAX_ATTEMPTS
    ):
        language = profile_service.get_language(db, current_user.id)
        detail = _RATE_LIMIT_MESSAGES[language].format(minutes=rate_limit.WINDOW_MINUTES)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
    rate_limit.record_failed_attempt(db, current_user.email, bucket="chat")


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_chat_rate_limit(db, current_user)
    reply, agent_used = run_orchestrator(db, current_user.id, payload.message)
    conversation_service.save_turn(db, current_user.id, payload.message, reply, agent_used)

    return ChatResponse(reply=reply, agent_used=agent_used)


@router.post("/stream")
def chat_stream(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """POST /chat ile aynı tur, Server-Sent Events olarak (2026-09-26): araç
    durumu, taslak parçaları ve sonda kesin yanıt (bkz. orchestrator.ChatStream).
    Her olay `data: {json}` satırı. İstemci bağlantıyı koparsa tur yine tamamlanır
    ve sohbet geçmişine kaydedilir - araçların yazdığı veriyle geçmiş tutarlı kalsın."""
    _enforce_chat_rate_limit(db, current_user)
    user_id = current_user.id
    stream = ChatStream(db, user_id, payload.message)

    def event_source():
        saved = False
        try:
            for event in stream.events():
                if event["type"] == "done":
                    conversation_service.save_turn(db, user_id, payload.message, event["reply"], event["agent_used"])
                    saved = True
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        finally:
            if not saved:
                reply, agent_used = stream.result()
                conversation_service.save_turn(db, user_id, payload.message, reply, agent_used)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        # Ters vekil sunucular (nginx) olayları biriktirmesin.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history", response_model=list[ConversationRead])
def history(
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return conversation_service.list_history(db, current_user.id, limit=limit)


@router.post("/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """"Sohbeti Sıfırla" - GERİ ALINABİLİR (veri sunucuda kalır, bkz.
    conversation_service.soft_clear). Ekran ve koçun bağlamı bu andan
    itibaren temiz sayfa görür, kalıcı silme için bkz. DELETE /chat/history."""
    conversation_service.soft_clear(db, current_user.id)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """"Sohbeti Kalıcı Olarak Sil" - GERİ ALINAMAZ, bkz.
    conversation_service.hard_delete_history."""
    conversation_service.hard_delete_history(db, current_user.id)
