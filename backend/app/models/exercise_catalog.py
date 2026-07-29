from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ExerciseCatalog(Base):
    """Salt-okunur egzersiz referans kataloğu (free-exercise-db'den seed edilir).
    Kullanıcıya bağlı değil, paylaşılan/bağımsız referans veridir."""

    __tablename__ = "exercise_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String, nullable=False)
    name_tr: Mapped[str] = mapped_column(String, nullable=False, index=True)
    category_tr: Mapped[str] = mapped_column(String, nullable=False)
    equipment_tr: Mapped[str | None] = mapped_column(String, nullable=True)
    primary_muscles_tr: Mapped[str] = mapped_column(String, nullable=False)
    secondary_muscles_tr: Mapped[str | None] = mapped_column(String, nullable=True)
    level_tr: Mapped[str] = mapped_column(String, nullable=False)
    force_tr: Mapped[str | None] = mapped_column(String, nullable=True)
    mechanic_tr: Mapped[str | None] = mapped_column(String, nullable=True)
    instructions_tr: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_translated: Mapped[bool] = mapped_column(Boolean, default=True)
