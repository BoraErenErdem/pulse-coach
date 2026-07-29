from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    session_date: Mapped[date_type] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    workout_type: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="workout_sessions")
    sets = relationship(
        "WorkoutSet", back_populates="session", cascade="all, delete-orphan", order_by="WorkoutSet.set_number"
    )
