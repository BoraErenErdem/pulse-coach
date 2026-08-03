import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.auth.security import generate_opaque_token, hash_opaque_token
from app.config import get_settings
from app.models.refresh_token import RefreshToken
from app.models.user import User

settings = get_settings()
logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    # SQLite tzinfo'yu round-trip'te korumuyor (naive datetime olarak geri
    # dönüyor) - bu yüzden bu dosyada baştan sona NAIVE UTC kullanılıyor,
    # DB'den okunan bir değerle karşılaştırırken tzinfo uyuşmazlığı olmasın.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def issue_refresh_token(db: Session, user_id: int) -> str:
    raw_token, _row = _create_refresh_token_row(db, user_id)
    return raw_token


def _create_refresh_token_row(db: Session, user_id: int) -> tuple[str, RefreshToken]:
    raw_token = generate_opaque_token()
    row = RefreshToken(
        user_id=user_id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=_utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return raw_token, row


def _revoke_all_active_for_user(db: Session, user_id: int) -> None:
    db.query(RefreshToken).filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)).update(
        {RefreshToken.revoked_at: _utcnow()}
    )
    db.commit()


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, str] | None:
    """Geçerli bir refresh token'ı doğrulayıp İPTAL EDER ve yerine yenisini
    verir (rotasyon) - aynı token iki kez kullanılamaz. Geçersiz/süresi dolmuş
    token için None döner.

    Zaten ROTASYONLA iptal edilmiş bir token tekrar sunulursa (replaced_by_id
    dolu) bu, token'ın çalınmış olabileceğinin klasik sinyalidir (OAuth
    "refresh token reuse detection") - kullanıcının TÜM aktif token'ları toplu
    iptal edilir, her cihazdan yeniden giriş gerekir. Sıradan bir logout/şifre
    sıfırlama iptali (replaced_by_id boş) bu toplu iptali TETİKLEMEZ, sadece
    401 döner - aksi halde bir logout sonrası aynı token'ın kazayla tekrar
    gönderilmesi (ör. ağ retry'ı) kullanıcının diğer meşru oturumlarını da
    gereksiz yere düşürürdü."""
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_opaque_token(raw_token)).first()
    if row is None:
        return None
    if row.revoked_at is not None:
        if row.replaced_by_id is not None:
            logger.warning("Refresh token reuse detected for user_id=%s", row.user_id)
            _revoke_all_active_for_user(db, row.user_id)
        return None
    if row.expires_at < _utcnow():
        return None

    user = db.get(User, row.user_id)
    if user is None:
        row.revoked_at = _utcnow()
        db.commit()
        return None

    new_raw_token, new_row = _create_refresh_token_row(db, user.id)
    row.revoked_at = _utcnow()
    row.replaced_by_id = new_row.id
    db.commit()
    return user, new_raw_token


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_opaque_token(raw_token)).first()
    if row is not None and row.revoked_at is None:
        row.revoked_at = _utcnow()
        db.commit()
