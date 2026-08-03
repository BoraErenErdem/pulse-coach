from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class RefreshToken(Base):
    """Opak, tek kullanımlık (rotasyonlu) yenileme token'ı. Ham token asla
    saklanmaz, sadece SHA-256 hash'i - refresh_token_service bunu karşılaştırır.
    access_token_expire_minutes kısa (30dk) tutulup oturumun asıl uzun ömrü
    buradan (refresh_token_expire_days) geliyor."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Sadece ROTASYONLA iptal edilen token'larda dolu - bu satırın yerini
    # hangi yeni token'ın aldığını işaretler. Açık logout/şifre-sıfırlama
    # iptallerinde None kalır. refresh_token_service.rotate_refresh_token bu
    # ayrımı, "token yeniden kullanımı" (çalıntı token sinyali - sadece
    # rotasyonla iptal edilmiş bir token tekrar sunulursa) ile sıradan bir
    # "zaten çıkış yapılmış/süresi dolmuş" hatasını birbirinden ayırmak için
    # kullanıyor.
    replaced_by_id: Mapped[int | None] = mapped_column(ForeignKey("refresh_tokens.id"), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")
