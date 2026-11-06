from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class DailySteps(Base):
    """Telefondan eşitlenen günlük adım toplamı (2026-11-06, kullanıcı geri
    bildirimi). Kaynak Apple Sağlık: iPhone + Apple Watch adımları orada çift
    sayılmadan birleşmiş geliyor. Kullanıcı başına gün başına tek satır
    (upsert); uygulama her açılışta son günleri yeniden gönderir, gün içinde
    sayı büyüdükçe aynı satır güncellenir. Kalori burada SAKLANMAZ: kilo/boy
    değişince yeniden hesaplanır (bkz. step_service.estimate_step_calories)."""

    __tablename__ = "daily_steps"
    __table_args__ = (UniqueConstraint("user_id", "step_date", name="uq_daily_steps_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    step_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    steps: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, default="apple_health")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="daily_steps")
