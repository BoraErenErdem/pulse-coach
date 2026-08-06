from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id"), nullable=False)
    exercise_catalog_id: Mapped[int | None] = mapped_column(ForeignKey("exercise_catalog.id"), nullable=True)
    exercise_name_snapshot: Mapped[str] = mapped_column(String, nullable=False)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # reps 2026-08-06'dan itibaren NULLABLE - süre bazlı (kardiyo/esneklik)
    # setler tekrar yerine duration_minutes taşıyor, bkz. aşağıdaki alanlar.
    # Bir set YA reps [+opsiyonel weight_kg] YA DA duration_minutes
    # [+intensity+cardio_category] taşır (mutually exclusive, bkz.
    # workout_service.py doğrulaması).
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    # hafif/orta/yogun - met_reference.py'deki MET tablosunun ikinci
    # anahtarı.
    intensity: Mapped[str | None] = mapped_column(String, nullable=True)
    # kosu/bisiklet/yuruyus/yuzme/ip_atlama/esneklik/genel_kardiyo -
    # met_reference.py'deki MET tablosunun birinci anahtarı.
    cardio_category: Mapped[str | None] = mapped_column(String, nullable=True)
    # Kayıt ANINDA hesaplanıp saklanır (kullanıcının kilosu zamanla
    # değiştiği için geçmişi tutarlı tutmak adına her seferinde yeniden
    # hesaplanmıyor) - kilo kaydı yoksa None kalır (spekülatif değer
    # YAZILMAZ, bkz. met_reference.estimate_calories).
    estimated_calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_personal_record: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("WorkoutSession", back_populates="sets")
