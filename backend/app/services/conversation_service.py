from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.conversation import Conversation
from app.models.user import User


def save_turn(db: Session, user_id: int, user_message: str, reply: str, agent_used: str) -> None:
    """Bir sohbet turunu (kullanıcı mesajı + asistan yanıtı, iki ayrı satır)
    kaydeder. `POST /chat` bu fonksiyonu çağırır — tek iş mantığı katmanı
    (2026-08-10 mimari borç raporu, bulgu #3 - önceden router doğrudan
    `Conversation(...)` oluşturup commit ediyordu)."""
    db.add(Conversation(user_id=user_id, role="user", content=user_message))
    db.add(Conversation(user_id=user_id, role="assistant", content=reply, agent_used=agent_used))
    db.commit()


def get_cleared_at(db: Session, user_id: int) -> datetime | None:
    """Kullanıcının en son "Sohbeti Sıfırla" (bkz. soft_clear) zamanı - hem
    `list_history` (görünüm) hem de `orchestrator._load_history` (koçun
    bağlamı) bu tarihten ÖNCEKİ satırları filtrelemek için kullanıyor, tek
    bir yerden - iki ayrı yerde NULL kontrolü/SQL karşılaştırma inceliği
    tekrarlanmasın diye (SQL'de `timestamp > NULL` her zaman NULL/false
    döner, bu yüzden filtre None iken HİÇ uygulanmıyor)."""
    return db.query(User.chat_cleared_at).filter(User.id == user_id).scalar()


def list_history(db: Session, user_id: int, limit: int | None = None) -> list[Conversation]:
    """Kullanıcının sohbet geçmişini kronolojik sırayla döner. `limit`
    verilirse en yeni N mesaj alınır, ama yine de eskiden-yeniye sıralı
    döndürülür (sohbet ekranının beklediği sıra). Sıfırlanmış (bkz.
    soft_clear) sohbetlerde sıfırlama ANINDAN öncesi listeye hiç girmez."""
    query = db.query(Conversation).filter(Conversation.user_id == user_id)
    cleared_at = get_cleared_at(db, user_id)
    if cleared_at is not None:
        query = query.filter(Conversation.timestamp > cleared_at)
    if limit is not None:
        rows = query.order_by(Conversation.timestamp.desc()).limit(limit).all()
        return list(reversed(rows))
    return query.order_by(Conversation.timestamp.asc()).all()


def soft_clear(db: Session, user_id: int) -> None:
    """"Sohbeti Sıfırla" - geçmiş veri SUNUCUDA KALIR (ileride analiz/geri
    getirme ihtimaline karşı), sadece bu andan ÖNCEKİ mesajlar hem görünümden
    hem koçun bağlamından gizlenir. Kalıcı silme için bkz. hard_delete_history."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return
    user.chat_cleared_at = datetime.now(timezone.utc)
    db.commit()


def hard_delete_history(db: Session, user_id: int) -> None:
    """"Sohbeti Kalıcı Olarak Sil" - GERİ ALINAMAZ, tüm Conversation satırları
    veritabanından silinir. chat_cleared_at de NULL'a dönüyor - artık
    gizlenecek bir şey kalmadığı için, temiz bir sıfırdan başlangıç durumu."""
    db.query(Conversation).filter(Conversation.user_id == user_id).delete()
    user = db.query(User).filter(User.id == user_id).first()
    if user is not None:
        user.chat_cleared_at = None
    db.commit()
