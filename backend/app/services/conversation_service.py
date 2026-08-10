from sqlalchemy.orm import Session
from app.models.conversation import Conversation


def save_turn(db: Session, user_id: int, user_message: str, reply: str, agent_used: str) -> None:
    """Bir sohbet turunu (kullanıcı mesajı + asistan yanıtı, iki ayrı satır)
    kaydeder. `POST /chat` bu fonksiyonu çağırır — tek iş mantığı katmanı
    (2026-08-10 mimari borç raporu, bulgu #3 - önceden router doğrudan
    `Conversation(...)` oluşturup commit ediyordu)."""
    db.add(Conversation(user_id=user_id, role="user", content=user_message))
    db.add(Conversation(user_id=user_id, role="assistant", content=reply, agent_used=agent_used))
    db.commit()


def list_history(db: Session, user_id: int, limit: int | None = None) -> list[Conversation]:
    """Kullanıcının sohbet geçmişini kronolojik sırayla döner. `limit`
    verilirse en yeni N mesaj alınır, ama yine de eskiden-yeniye sıralı
    döndürülür (sohbet ekranının beklediği sıra)."""
    query = db.query(Conversation).filter(Conversation.user_id == user_id)
    if limit is not None:
        rows = query.order_by(Conversation.timestamp.desc()).limit(limit).all()
        return list(reversed(rows))
    return query.order_by(Conversation.timestamp.asc()).all()
