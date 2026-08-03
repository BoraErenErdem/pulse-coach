from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class RateLimitAttempt(Base):
    """Rate limiting için tek satırlık deneme kaydı. Önceden tek-process
    in-memory bir dict'te tutuluyordu; SQLite'a taşınması sayaçların süreç
    yeniden başlasa da (ya da ileride birden fazla worker açılsa da) doğru
    çalışmasını sağlıyor. Naive UTC kullanılıyor (bkz. refresh_token_service.py
    - SQLite tzinfo'yu round-trip'te korumuyor)."""

    __tablename__ = "rate_limit_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bucket: Mapped[str] = mapped_column(String, nullable=False, index=True)
    identifier: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True
    )
