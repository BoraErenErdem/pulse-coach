"""Kullanıcı başına GÜNLÜK sohbet/fotoğraf kotası (2026-09-30).

15 dakikalık pencere (auth/rate_limit.py) yalnız kısa patlamaları kesiyor: tek
bir kullanıcı saatte ~240 sohbet turuyla paylaşılan GPU'yu doldurabiliyordu.
Günlük tavan hem GPU'yu korur hem ileride ücretli paket için zemin olur.

Ayrı bir sayaç tablosu yok: sohbet ve fotoğraf endpoint'leri her çağrıyı zaten
`rate_limit_attempts`e yazıyor (bucket "chat" / "photo_analyze"). Gün sınırı
kullanıcının YEREL gece yarısı (User.timezone, bkz. user_time.py) - bu yüzden
o tablonun saklama süresi (rate_limit_attempt_retention_days) en az 2 gün olmalı.
Limit 0 ise kota kapalıdır."""

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.rate_limit_attempt import RateLimitAttempt
from app.models.user import User
from app.services.user_time import zone_for

CHAT_BUCKET = "chat"
PHOTO_BUCKET = "photo_analyze"

_EXCEEDED_MESSAGES = {
    CHAT_BUCKET: {
        "tr": "Bugünkü {limit} mesaj hakkını kullandın. Hakların gece yarısı (yerel saat) yenilenir.",
        "en": "You've used today's {limit} messages. Your limit resets at midnight (local time).",
    },
    PHOTO_BUCKET: {
        "tr": "Bugünkü {limit} fotoğraf analizi hakkını kullandın. Hakların gece yarısı (yerel saat) yenilenir.",
        "en": "You've used today's {limit} photo analyses. Your limit resets at midnight (local time).",
    },
}


@dataclass(frozen=True)
class DailyUsage:
    used: int
    limit: int  # 0 = sınırsız
    resets_at: datetime  # saat dilimli UTC

    @property
    def remaining(self) -> int | None:
        return None if self.limit == 0 else max(self.limit - self.used, 0)

    @property
    def exceeded(self) -> bool:
        return self.limit > 0 and self.used >= self.limit


def daily_limit(bucket: str) -> int:
    settings = get_settings()
    return settings.chat_daily_limit if bucket == CHAT_BUCKET else settings.photo_daily_limit


def _local_day_bounds_utc(timezone_name: str | None, now: datetime | None = None) -> tuple[datetime, datetime]:
    zone = zone_for(timezone_name)
    local_now = (now or datetime.now(timezone.utc)).astimezone(zone)
    start_local = datetime.combine(local_now.date(), time.min, tzinfo=zone)
    end_local = datetime.combine(local_now.date() + timedelta(days=1), time.min, tzinfo=zone)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def daily_usage(db: Session, user: User, bucket: str, now: datetime | None = None) -> DailyUsage:
    start_utc, end_utc = _local_day_bounds_utc(user.timezone, now)
    used = (
        db.query(RateLimitAttempt)
        .filter(
            RateLimitAttempt.bucket == bucket,
            RateLimitAttempt.identifier == user.email,
            # Tablo naive UTC saklıyor (bkz. models/rate_limit_attempt.py).
            RateLimitAttempt.created_at >= start_utc.replace(tzinfo=None),
        )
        .count()
    )
    return DailyUsage(used=used, limit=daily_limit(bucket), resets_at=end_utc)


def exceeded_message(bucket: str, language: str, limit: int) -> str:
    messages = _EXCEEDED_MESSAGES[bucket]
    return messages.get(language, messages["tr"]).format(limit=limit)
