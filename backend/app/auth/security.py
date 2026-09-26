import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import get_settings

settings = get_settings()

# passlib yerine doğrudan bcrypt (2026-09-26): passlib bakımsız. Mevcut hash'ler
# aynı standart "$2b$12$..." biçiminde, olduğu gibi doğrulanıyor. bcrypt yalnızca
# ilk 72 baytı kullanır; eski sürümler fazlasını sessizce kesiyordu, yenileri
# (5.x) hata veriyor - aynı davranışı sürümden bağımsız tutmak için açıkça kesiyoruz.
_BCRYPT_MAX_BYTES = 72
_BCRYPT_ROUNDS = 12


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("ascii"))
    except ValueError:
        # Bozuk/bcrypt olmayan hash - giriş reddedilir, 500 verilmez.
        return False


ACCESS_TOKEN_TYPE = "access"


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"typ": ACCESS_TOKEN_TYPE, "sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """2026-09-23 denetimi: `typ` kontrolü önceden sadece pending token
    tarafında vardı (decode_pending_oauth_token) - ters yön açıktı: aynı
    anahtarla imzalanmış bir pending OAuth token'ı Bearer olarak sunulunca
    access token gibi kabul ediliyor, `sub` claim'i (Google/Apple'ın kendi
    kullanıcı kimliği) doğrudan bizim user_id'miz sanılıyordu. `typ`'siz
    token'lar bu değişiklikten önce üretilmiş (en fazla 30 dk ömürlü) meşru
    access token'lar olduğu için kabul edilmeye devam ediyor - pending
    token'lar her zaman `typ` taşıdığı için bu ayrım yeterli."""
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("typ", ACCESS_TOKEN_TYPE) != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("not an access token")
    return payload


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
