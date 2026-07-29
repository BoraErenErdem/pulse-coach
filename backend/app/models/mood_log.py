from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class MoodLog(Base):
    """Kullanıcının günlük olarak işaretlediği ruh hali (emoji tabanlı öz-
    bildirim, MoodPicker widget'ı). Kullanıcı başına gün başına tek kayıt
    (upsert). Orchestrator bunu SADECE ton ayarlamak için bağlam olarak
    kullanır — kriz tespiti (mood_support_agent.check_crisis_indicators)
    tamamen ayrı, ham mesaj metnine dayalı deterministik bir katmandır ve
    bu tablodan hiçbir şekilde etkilenmez."""

    __tablename__ = "mood_logs"
    __table_args__ = (UniqueConstraint("user_id", "log_date", name="uq_mood_logs_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    mood_key: Mapped[str] = mapped_column(String, nullable=False)
    log_date: Mapped[date_type] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="mood_logs")
