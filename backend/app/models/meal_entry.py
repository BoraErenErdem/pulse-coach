from datetime import date as date_type
from datetime import datetime, timezone
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class MealEntry(Base):
    """Kalori/makro değerleri log anında hesaplanıp snapshot'lanır — katalog
    sonradan düzeltilirse geçmiş kayıtlar kaymasın diye."""

    __tablename__ = "meal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    food_catalog_id: Mapped[int | None] = mapped_column(ForeignKey("food_catalog.id"), nullable=True)
    food_name_snapshot: Mapped[str] = mapped_column(String, nullable=False)
    meal_type: Mapped[str] = mapped_column(String, nullable=False)
    quantity_grams: Mapped[float] = mapped_column(Float, nullable=False)
    calories_kcal: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    sugar_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sodium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    log_date: Mapped[date_type] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="meal_entries")
    # Gösterim adı için (bkz. services/food_names.py); selectin = liste
    # başına tek ek IN sorgusu, kayıt başına sorgu değil.
    food_catalog = relationship("FoodCatalog", lazy="selectin")

    @property
    def food_name_tr(self) -> str:
        from app.services.food_names import localized_names

        return localized_names(self.food_name_snapshot, self.food_catalog)[0]

    @property
    def food_name_en(self) -> str:
        from app.services.food_names import localized_names

        return localized_names(self.food_name_snapshot, self.food_catalog)[1]
