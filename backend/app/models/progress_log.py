from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ProgressLog(Base):
    __tablename__ = "progress_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Opsiyonel vücut ölçümleri (2026-08-11, kullanıcı isteği): kilo tek
    # başına yanıltıcı olabilir (kas artarken kilo sabit kalabilir/artabilir) -
    # bkz. progress_service.py::get_body_composition_insight. Aynı formda,
    # aynı satırda tutuluyor - ayrı bir tablo/ekran gerekmiyor.
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    workout_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    workout_type: Mapped[str | None] = mapped_column(String, nullable=True)
    log_date: Mapped[date_type] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    # log_workout_session bir oturum kaydederken otomatik olarak bu basit
    # "workout_completed" satırını da oluşturuyor (bkz. workout_service.py) -
    # önceden bu satırla oturum arasında GERÇEK bir bağ yoktu, sadece
    # log_date eşleşmesi vardı. Bu yüzden bir oturum silindiğinde otomatik
    # oluşan satır YETİM kalıyordu (2026-08-14 canlı test turunda bulundu,
    # bkz. proje belleği). nullable - elle/chat üzerinden girilen ölçüm
    # kayıtlarında (bir oturuma bağlı olmayanlar) hep None kalır.
    source_workout_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_sessions.id"), nullable=True
    )

    user = relationship("User", back_populates="progress_logs")
