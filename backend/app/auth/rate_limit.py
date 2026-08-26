from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.rate_limit_attempt import RateLimitAttempt

"""Kimlik başına deneme sayan, SQLite'a (app'in kendi DB'si) yazan bir rate
limiter. Önceden tek-process bir in-memory dict'ti (bkz. git geçmişi) - süreç
yeniden başlayınca sayaçlar sıfırlanıyordu ve ileride birden fazla worker
açılırsa her worker kendi sayacını tutup limiti etkisiz kılıyordu. SQLite'a
taşınması ikisini de çözüyor, yeni bir bağımlılık (Redis/Mongo) gerekmiyor.

`identifier` e-posta olabilir (login, forgot-password - aynı hesabı hedef
alan denemeleri sınırlamak için) ya da IP adresi olabilir (register - farklı
e-postalarla deneme yapılsa bile tek kaynaktan spam'i sınırlamak için).
`bucket` aynı kimliğin farklı endpoint'lerdeki denemelerini birbirinden
ayırır (ör. "login" başarısız denemesi "forgot_password" sayacını
etkilemez)."""

MAX_ATTEMPTS = 5
# register, login'in aksine "yanlış deneme" değil "toplam deneme" sayıyor
# (bkz. auth/router.py) - bu yüzden çok daha yüksek bir tavana ihtiyacı var,
# aksi halde meşru bir test paketi/kullanım bile kilitlenebilir.
REGISTER_MAX_ATTEMPTS = 30
# /chat her çağrıda gerçek bir LLM isteği tetikliyor (register gibi "toplam
# deneme" sayılıyor, "başarısız deneme" değil) - kişisel/dev kullanımda
# meşru bir sohbeti kesmeyecek kadar yüksek ama olası bir suistimal/bug
# döngüsünü sınırlayacak bir tavan.
CHAT_MAX_ATTEMPTS = 60
# forgot-password IP bazlı sınır - register'daki gibi FARKLI e-postalarla
# toplu deneme (email enumeration/spam) yapılmasını sınırlıyor; e-posta
# bazlı MAX_ATTEMPTS (aynı hesabı hedef alan denemeler) ile ayrı bir bucket.
FORGOT_PASSWORD_IP_MAX_ATTEMPTS = 30
# login IP bazlı sınır - aynı desen (bkz. FORGOT_PASSWORD_IP_MAX_ATTEMPTS):
# e-posta bazlı MAX_ATTEMPTS tek bir hesabı hedef alan denemeleri sınırlıyor
# ama tek bir IP'den FARKLI e-postalarla düşük-hacimli "password spraying"
# yapılmasına karşı savunmasızdı (2026-08-26 güvenlik denetimi). Başarılı
# girişte bu bucket TEMİZLENMİYOR (bkz. router.py login()) - aynı IP'yi
# paylaşan birden fazla meşru kullanıcı (ör. aynı ev) birbirini kilitlemesin
# diye tavan forgot-password'daki kadar yüksek tutuldu.
LOGIN_IP_MAX_ATTEMPTS = 30
# /nutrition/photo-analyze de /chat gibi her çağrıda gerçek bir LLM isteği
# (vision modeli) tetikliyor ama 2026-08-10 pürüz taramasına kadar hiç
# sınırlanmamıştı - CHAT_MAX_ATTEMPTS'ten daha düşük çünkü vision çağrıları
# görece daha ağır/yavaş (bkz. proje belleği, gemma4:12b ~6-22sn/çağrı).
PHOTO_ANALYZE_MAX_ATTEMPTS = 30
WINDOW_MINUTES = 15


def _utcnow() -> datetime:
    # SQLite tzinfo'yu round-trip'te korumuyor (naive datetime olarak geri
    # dönüyor) - bu yüzden refresh_token_service.py'deki aynı desenle NAIVE
    # UTC kullanılıyor.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_locked_out(db: Session, identifier: str, bucket: str = "login", max_attempts: int = MAX_ATTEMPTS) -> bool:
    cutoff = _utcnow() - timedelta(minutes=WINDOW_MINUTES)
    count = (
        db.query(RateLimitAttempt)
        .filter(
            RateLimitAttempt.bucket == bucket,
            RateLimitAttempt.identifier == identifier,
            RateLimitAttempt.created_at >= cutoff,
        )
        .count()
    )
    return count >= max_attempts


def record_failed_attempt(db: Session, identifier: str, bucket: str = "login") -> None:
    db.add(RateLimitAttempt(bucket=bucket, identifier=identifier))
    db.commit()


def clear_attempts(db: Session, identifier: str, bucket: str = "login") -> None:
    db.query(RateLimitAttempt).filter(
        RateLimitAttempt.bucket == bucket, RateLimitAttempt.identifier == identifier
    ).delete()
    db.commit()
