import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# Google/Apple ile YENİ kullanıcı akışı (bkz. config.py'deki aynı not,
# oauth_service.py): kimlik sağlayıcı tarafında doğrulanmış ama henüz KVKK/
# sağlık verisi/Kullanım Koşulları rızası vermemiş bir kullanıcı için hesap
# açılmadan önce bu kısa ömürlü token'a sarılıyor - istemci rıza ekranını
# gösterip onay aldıktan sonra bunu tekrar sunucuya yolluyor (ham id_token'ı
# İKİNCİ KEZ göndermesi/istemcinin ham OAuth token'ını uzun süre saklaması
# gerekmiyor). `typ` claim'i normal access_token'larla KARIŞMASINI önlüyor -
# aksi halde süresi geçmiş bir access_token'ı buraya sunup hesap açtırmaya
# çalışmak (ya da tam tersi) mümkün olurdu.
def create_pending_oauth_token(provider: str, sub: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.oauth_pending_token_expire_minutes)
    payload = {"typ": "oauth_pending", "provider": provider, "sub": sub, "email": email, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_pending_oauth_token(token: str) -> dict:
    """Geçersiz/süresi dolmuş token için jwt.InvalidTokenError (ya da alt
    sınıfı) fırlatır - çağıran taraf (router) bunu tek bir yerde (generic
    400) yakalıyor. `provider` payload'ın İÇİNDE taşınıyor (register/login
    gibi tek bir /auth/oauth/complete endpoint'i her iki sağlayıcıya da
    hizmet edebiliyor, ayrı /google/complete + /apple/complete gerekmiyor)."""
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != "oauth_pending":
        raise jwt.InvalidTokenError("not a pending oauth token")
    return payload


def generate_opaque_token() -> str:
    # Yüksek entropili opak token (refresh_token + şifre sıfırlama token'ı
    # ortak kullanıyor) - kullanıcı tarafından seçilmediği için şifrelerde
    # olduğu gibi yavaş bir hash (bcrypt) gerekmiyor, sha256 yeterli.
    return secrets.token_urlsafe(48)


def hash_opaque_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
