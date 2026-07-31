from datetime import datetime, timedelta, timezone

"""Kimlik başına deneme sayan basit, bağımlılıksız bir in-memory rate
limiter. Harici bir kütüphane (ör. slowapi/Redis) yerine tercih edildi —
proje tek-process, kişisel/dev ölçekli bir kullanım hedefliyor (bkz.
`fuzzy_match.py`'deki benzer "hafif, custom çözüm" tercihi). Sunucu
yeniden başladığında sayaçların sıfırlanması bilinçli bir tradeoff, bu
ölçekte kabul edilebilir.

`identifier` e-posta olabilir (login, forgot-password - aynı hesabı hedef
alan denemeleri sınırlamak için) ya da IP adresi olabilir (register - farklı
e-postalarla deneme yapılsa bile tek kaynaktan spam'i sınırlamak için).
`bucket` aynı kimliğin farklı endpoint'lerdeki denemelerini birbirinden
ayırır (ör. "login" başarısız denemesi "forgot_password" sayacını
etkilemez) - anahtar `f"{bucket}:{identifier}"` şeklinde birleştirilir."""

MAX_ATTEMPTS = 5
# register, login'in aksine "yanlış deneme" değil "toplam deneme" sayıyor
# (bkz. auth/router.py) - bu yüzden çok daha yüksek bir tavana ihtiyacı var,
# aksi halde meşru bir test paketi/kullanım bile kilitlenebilir.
REGISTER_MAX_ATTEMPTS = 30
WINDOW_MINUTES = 15

_attempts: dict[str, list[datetime]] = {}


def _key(bucket: str, identifier: str) -> str:
    return f"{bucket}:{identifier}"


def _prune(bucket: str, identifier: str) -> list[datetime]:
    key = _key(bucket, identifier)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)
    attempts = [ts for ts in _attempts.get(key, []) if ts >= cutoff]
    _attempts[key] = attempts
    return attempts


def is_locked_out(identifier: str, bucket: str = "login", max_attempts: int = MAX_ATTEMPTS) -> bool:
    return len(_prune(bucket, identifier)) >= max_attempts


def reset_all() -> None:
    """Sadece testler için - process boyunca kalıcı olan modül-seviyesi
    sayaçları temizler (her testin fresh bir in-memory DB'si var ama bu
    dict öyle değil, bkz. tests/conftest.py'deki autouse fixture)."""
    _attempts.clear()


def record_failed_attempt(identifier: str, bucket: str = "login") -> None:
    attempts = _prune(bucket, identifier)
    attempts.append(datetime.now(timezone.utc))
    _attempts[_key(bucket, identifier)] = attempts


def clear_attempts(identifier: str, bucket: str = "login") -> None:
    _attempts.pop(_key(bucket, identifier), None)
