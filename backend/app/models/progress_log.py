from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ProgressLog(Base):
    __tablename__ = "progress_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    measurements_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    workout_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    workout_type: Mapped[str | None] = mapped_column(String, nullable=True)
    log_date: Mapped[date_type] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())

    user = relationship("User", back_populates="progress_logs")
