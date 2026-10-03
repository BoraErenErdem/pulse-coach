import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.auth.security import generate_opaque_token, hash_opaque_token, hash_password
from app.config import get_settings
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import email_service

logger = logging.getLogger(__name__)
settings = get_settings()


def _utcnow() -> datetime:
    # refresh_token_service.py'deki aynı sebep: SQLite tzinfo'yu korumuyor.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def request_password_reset(db: Session, email: str) -> tuple[str, str] | None:
    """Kullanıcı varsa sıfırlama token'ı oluşturur ve gönderilecek
    (e-posta, link) çiftini döner; gönderimi router yanıttan SONRA arka
    planda deliver_reset_email ile yapar. Kullanıcı yoksa SESSİZCE None
    döner - router her durumda aynı yanıtı döndürür (enumeration koruması).
    SMTP isteğin içinde yapılsaydı kayıtlı adreste yanıt ~1-2 sn gecikir
    (SMTP başarısızsa 500 olurdu), adresin varlığı süreden okunabilirdi."""
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return None

    raw_token = generate_opaque_token()
    row = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=_utcnow() + timedelta(minutes=settings.password_reset_token_expire_minutes),
    )
    db.add(row)
    db.commit()

    reset_link = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
    return user.email, reset_link


def deliver_reset_email(to_email: str, reset_link: str) -> None:
    """Arka plan görevi: yanıt zaten dönmüş olduğundan hata yükseltmek
    istemciye ulaşmaz, sadece loglanır (link loga YAZILMAZ)."""
    try:
        email_service.send_password_reset_email(to_email, reset_link)
    except Exception:
        logger.exception("Şifre sıfırlama e-postası gönderilemedi")


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
