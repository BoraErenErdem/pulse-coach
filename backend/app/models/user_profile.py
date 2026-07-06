from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    goal: Mapped[str | None] = mapped_column(String, nullable=True)  # weight_loss / muscle_gain / general_health
    activity_level: Mapped[str | None] = mapped_column(String, nullable=True)  # sedentary / light / moderate / active
    dietary_restrictions: Mapped[str | None] = mapped_column(String, nullable=True)  # free text / comma separated
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="profile")
