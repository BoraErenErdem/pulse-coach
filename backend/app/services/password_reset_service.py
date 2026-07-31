from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.auth.security import generate_opaque_token, hash_opaque_token, hash_password
from app.config import get_settings
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import email_service

settings = get_settings()


def _utcnow() -> datetime:
    # refresh_token_service.py'deki aynı sebep: SQLite tzinfo'yu korumuyor.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def request_password_reset(db: Session, email: str) -> None:
    """Kullanıcı varsa sıfırlama e-postası (dev modunda log) gönderir.
    Kullanıcı yoksa SESSİZCE hiçbir şey yapmaz - router her durumda aynı
    yanıtı döndürür, böylece bu fonksiyon bir e-posta adresinin sistemde
    kayıtlı olup olmadığını dışarıdan ayırt edilemez kılar (enumeration
    koruması)."""
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return

    raw_token = generate_opaque_token()
    row = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=_utcnow() + timedelta(minutes=settings.password_reset_token_expire_minutes),
    )
    db.add(row)
    db.commit()

    reset_link = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
    email_service.send_password_reset_email(user.email, reset_link)


def reset_password(db: Session, raw_token: str, new_password: str) -> bool:
    """Token geçerliyse şifreyi değiştirir, token'ı tek kullanımlık olarak
    tüketir ve kullanıcının TÜM refresh_token'larını iptal eder (şifre
    değiştiyse her cihazdan/tarayıcıdan oturum kapanmalı). Başarılıysa
    True, geçersiz/süresi dolmuş/zaten kullanılmış token için False döner."""
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == hash_opaque_token(raw_token)).first()
    if row is None or row.used_at is not None or row.expires_at < _utcnow():
        return False

    user = db.get(User, row.user_id)
    if user is None:
        return False

    user.hashed_password = hash_password(new_password)
    row.used_at = _utcnow()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update(
        {RefreshToken.revoked_at: _utcnow()}
    )
    db.commit()
    return True
