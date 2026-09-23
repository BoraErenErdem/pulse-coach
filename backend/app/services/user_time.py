"""Kullanıcının YEREL takvim günü (2026-09-23).

Önceden "bugün" her yerde `datetime.now(timezone.utc).date()` idi - Türkiye'de
(UTC+3) 00:00-03:00 arası girilen bir antrenman/öğün/ruh hali bir ÖNCEKİ güne
yazılıyor, "bugünkü" özetler o saatlerde dünü gösteriyordu. İstemciler (web/
mobil) her istekte cihazın IANA saat dilimini `X-Timezone` header'ıyla
gönderiyor, `get_current_user` değiştiğinde `User.timezone`'a yazıyor (bkz.
auth/dependencies.py) - zamanlanmış işler (istek yokken) de aynı değeri
kullanabiliyor.

Saat dilimi bilinmiyorsa (eski istemci, hiç istek atmamış kullanıcı) UTC'ye
düşülür - yani davranış bu değişiklikten ÖNCEKİYLE birebir aynı kalır."""

from datetime import date, datetime, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.user import User

# IANA adları en fazla ~30 karakter ("America/Argentina/ComodRivadavia") -
# header'dan gelen keyfi uzunlukta bir değer DB'ye yazılmasın.
_MAX_TIMEZONE_NAME_LENGTH = 64


def parse_timezone(name: str | None) -> tzinfo | None:
    """Geçerli bir IANA saat dilimi adıysa tzinfo, değilse None."""
    if not name or len(name) > _MAX_TIMEZONE_NAME_LENGTH:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def zone_for(timezone_name: str | None) -> tzinfo:
    return parse_timezone(timezone_name) or timezone.utc


def local_today(timezone_name: str | None) -> date:
    return datetime.now(zone_for(timezone_name)).date()


def user_today(db: Session, user_id: int) -> date:
    user = db.get(User, user_id)
    return local_today(user.timezone if user is not None else None)


def remember_timezone(db: Session, user: User, timezone_name: str | None) -> None:
    """İstemcinin bildirdiği saat dilimini, geçerliyse VE değiştiyse kaydeder -
    her istekte değil sadece değişimde yazıldığı için ek maliyeti yok denecek
    kadar az (bir kullanıcı için pratikte tek bir kez)."""
    if timezone_name == user.timezone or parse_timezone(timezone_name) is None:
        return
    user.timezone = timezone_name
    db.commit()
