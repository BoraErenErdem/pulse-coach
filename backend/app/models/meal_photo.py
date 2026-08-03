from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class MealPhoto(Base):
    """Analiz edilen bir yemek fotoğrafının kalıcı kaydı - fotoğraf geçmişi
    galerisi için. Görüntü baytları doğrudan SQLite'a (BLOB) kaydediliyor,
    ayrı bir dosya sistemi/depolama yönetimi gerektirmiyor - projenin tek-DB
    felsefesiyle tutarlı, mevcut backup_service zaten bu tabloyu da kapsıyor."""

    __tablename__ = "meal_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    image_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    # Analizde tespit edilen besinlerin kısa, virgülle ayrılmış özeti (ör.
    # "Somon fileto, Kinoa, Tatlı patates") - galeri listesinde her fotoğrafı
    # tekrar açmadan ne olduğunu göstermek için.
    detected_items_summary: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="meal_photos")
