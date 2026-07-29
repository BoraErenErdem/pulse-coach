from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ExerciseGoal(Base):
    """Kullanıcının belirli bir egzersizde ulaşmak istediği ağırlık hedefi
    (ör. 'squat'ta 100 kg'a ulaşmak istiyorum'). Kullanıcı başına aynı
    egzersiz için tek kayıt tutulur (upsert), ilerleme WorkoutSet
    geçmişindeki en iyi (en ağır) kayıtla karşılaştırılır."""

    __tablename__ = "exercise_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    exercise_catalog_id: Mapped[int | None] = mapped_column(ForeignKey("exercise_catalog.id"), nullable=True)
    exercise_name: Mapped[str] = mapped_column(String, nullable=False)
    target_weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="exercise_goals")
