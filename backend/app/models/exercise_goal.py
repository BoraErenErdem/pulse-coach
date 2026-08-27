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
    # 2026-08-27: kardiyo/esneklik (kosu bandi vb.) hedefleri agirlik yerine
    # dakika bazli sure takip eder - bu yuzden target_weight_kg NULLABLE'a
    # cevrildi (agirlik HEM tekrar hem sure ile ayni satirda birlikte
    # bulunmaz, set_exercise_goal'daki dogrulama bunu garanti eder).
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Opsiyonel - bir agirlik hedefine "en az X tekrar da at" alt-hedefi
    # eklemek icin (ör. "60 kg ile 8 tekrar"). Sadece target_weight_kg
    # varken anlamli.
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Sadece kardiyo/esneklik (sure bazli) hedefler icin - target_weight_kg/
    # target_reps ile MUTUALLY EXCLUSIVE (bkz. set_exercise_goal).
    target_duration_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="exercise_goals")
