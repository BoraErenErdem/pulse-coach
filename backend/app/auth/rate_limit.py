from datetime import datetime, timedelta, timezone

"""E-posta başına başarısız giriş denemesi sayan basit, bağımlılıksız bir
in-memory rate limiter. Harici bir kütüphane (ör. slowapi/Redis) yerine
tercih edildi — proje tek-process, kişisel/dev ölçekli bir kullanım
hedefliyor (bkz. `fuzzy_match.py`'deki benzer "hafif, custom çözüm"
tercihi). Sunucu yeniden başladığında sayaçların sıfırlanması bilinçli bir
tradeoff, bu ölçekte kabul edilebilir."""

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 15

_failed_attempts: dict[str, list[datetime]] = {}


def _prune(email: str) -> list[datetime]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)
    attempts = [ts for ts in _failed_attempts.get(email, []) if ts >= cutoff]
    _failed_attempts[email] = attempts
    return attempts


def is_locked_out(email: str) -> bool:
    return len(_prune(email)) >= MAX_ATTEMPTS


def record_failed_attempt(email: str) -> None:
    attempts = _prune(email)
    attempts.append(datetime.now(timezone.utc))
    _failed_attempts[email] = attempts


def clear_attempts(email: str) -> None:
    _failed_attempts.pop(email, None)
