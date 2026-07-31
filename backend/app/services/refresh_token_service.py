from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.auth.security import generate_opaque_token, hash_opaque_token
from app.config import get_settings
from app.models.refresh_token import RefreshToken
from app.models.user import User

settings = get_settings()


def _utcnow() -> datetime:
    # SQLite tzinfo'yu round-trip'te korumuyor (naive datetime olarak geri
    # dönüyor) - bu yüzden bu dosyada baştan sona NAIVE UTC kullanılıyor,
    # DB'den okunan bir değerle karşılaştırırken tzinfo uyuşmazlığı olmasın.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def issue_refresh_token(db: Session, user_id: int) -> str:
    raw_token = generate_opaque_token()
    row = RefreshToken(
        user_id=user_id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=_utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(row)
    db.commit()
    return raw_token


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, str] | None:
    """Geçerli bir refresh token'ı doğrulayıp İPTAL EDER ve yerine yenisini
    verir (rotasyon) - aynı token iki kez kullanılamaz, bu da çalınmış bir
    token'ın sessizce süresiz kullanılmasını engeller. Geçersiz/süresi
    dolmuş/iptal edilmiş token için None döner."""
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_opaque_token(raw_token)).first()
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at < _utcnow():
        return None

    row.revoked_at = _utcnow()
    user = db.get(User, row.user_id)
    if user is None:
        db.commit()
        return None

    new_raw_token = issue_refresh_token(db, user.id)
    return user, new_raw_token


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_opaque_token(raw_token)).first()
    if row is not None and row.revoked_at is None:
        row.revoked_at = _utcnow()
        db.commit()
