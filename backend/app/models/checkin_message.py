from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CheckinMessage(Base):
    __tablename__ = "checkin_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # "weekly_summary" / "daily_nudge" - haftalık özet ve günlük koşullu
    # hatırlatma AYNI tabloyu paylaşıyor (2026-08-12 kararı: ekran adı
    # "Bildirimler"e çevrildi, mevcut list_and_mark_delivered() okunmamış/
    # rozet mekanizması aynen yeniden kullanılıyor). PR/hedef anlık
    # kutlamaları BU TABLOYA HİÇ girmiyor (kalıcı izleri zaten Rekor
    # rozeti/GoalMeter'da var, ikinci bir yerde tutmak gereksiz tekrar olurdu).
    kind: Mapped[str] = mapped_column(String, nullable=False, default="weekly_summary")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="checkin_messages")