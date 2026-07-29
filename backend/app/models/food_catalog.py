from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class FoodCatalog(Base):
    """Salt-okunur besin referans kataloğu (USDA FoodData Central'dan
    küratörlü bir alt küme olarak seed edilir). Tüm besin değerleri per-100g
    (USDA'nın taban birimi) — hesap dilden/porsiyondan bağımsız kalır.
    Kullanıcıya bağlı değil, paylaşılan/bağımsız referans veridir."""

    __tablename__ = "food_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fdc_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String, nullable=False)
    name_tr: Mapped[str] = mapped_column(String, nullable=False, index=True)
    data_type: Mapped[str] = mapped_column(String, nullable=False)  # sr_legacy_food / foundation_food
    category_tr: Mapped[str | None] = mapped_column(String, nullable=True)
    calories_kcal: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    fiber_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_translated: Mapped[bool] = mapped_column(Boolean, default=True)
