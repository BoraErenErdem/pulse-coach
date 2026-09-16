import logging
from dataclasses import dataclass

import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_APPLE_ISSUER = "https://appleid.apple.com"

# PyJWKClient kendi içinde anahtarları önbelleğe alır (varsayılan davranış) -
# her istekte Apple'ın JWKS uç noktasına gitmek yerine, tek bir modül-düzeyi
# istemci tüm süreç boyunca yeniden kullanılıyor.
_apple_jwk_client = jwt.PyJWKClient(_APPLE_JWKS_URL)


class OAuthVerificationError(Exception):
    """Token geçersiz/süresi dolmuş/yanlış audience - router bunu 401'e
    çeviriyor. Ayrıntılı sebep (hangi kontrol başarısız oldu) SADECE log'a
    yazılıyor, istemciye dönmüyor - aksi halde bir saldırgana hangi
    doğrulama adımının nerede durduğunu (imza mı, audience mı, issuer mı)
    gösterirdik."""


@dataclass
class VerifiedIdentity:
    sub: str
    email: str | None
    email_verified: bool


def verify_google_id_token(raw_token: str) -> VerifiedIdentity:
    if not settings.google_client_ids_list:
        # .env'de hiç yapılandırılmamışsa (bkz. config.py'deki aynı not)
        # BİLEREK reddediyoruz - "audience kontrolü atla" gibi bir varsayılana
        # asla düşmüyoruz.
        raise OAuthVerificationError("Google OAuth is not configured")
    try:
        # google-auth kütüphanesi imzayı Google'ın kendi genel anahtarlarına
        # (Google'ın JWKS'i, kütüphane içinde önbelleklenir) karşı doğruluyor
        # VE issuer'ın (`accounts.google.com`) doğru olduğunu kontrol ediyor -
        # burada elle tekrarlamıyoruz. `audience` parametresi TEK bir string
        # bekliyor, listedeki HERHANGİ birine eşleşmeyi manuel kontrol
        # ediyoruz (iOS/Android/Web farklı client ID'lere sahip).
        payload = google_id_token.verify_oauth2_token(raw_token, google_requests.Request())
    except ValueError as exc:
        logger.warning("Google id_token verification failed: %s", exc)
        raise OAuthVerificationError("invalid Google id_token") from exc

    if payload.get("aud") not in settings.google_client_ids_list:
        logger.warning("Google id_token audience mismatch: %s", payload.get("aud"))
        raise OAuthVerificationError("unexpected Google audience")

    return VerifiedIdentity(
        sub=payload["sub"],
        email=payload.get("email"),
        email_verified=bool(payload.get("email_verified")),
    )


def verify_apple_identity_token(raw_token: str) -> VerifiedIdentity:
    if not settings.apple_client_ids_list:
        raise OAuthVerificationError("Apple OAuth is not configured")
    try:
        signing_key = _apple_jwk_client.get_signing_key_from_jwt(raw_token)
        payload = jwt.decode(
            raw_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.apple_client_ids_list,
            issuer=_APPLE_ISSUER,
        )
    except jwt.PyJWTError as exc:
        logger.warning("Apple identity_token verification failed: %s", exc)
        raise OAuthVerificationError("invalid Apple identity_token") from exc

    return VerifiedIdentity(
        sub=payload["sub"],
        email=payload.get("email"),
        # Apple, e-posta gizleme (private relay) kullanılmadığı sürece
        # her zaman doğrulanmış bir e-posta verir - "true"/"false" string
        # OLARAK da gelebiliyor (Apple'ın bilinen bir tuhaflığı), bu yüzden
        # düz `bool(...)` yerine açıkça karşılaştırıyoruz.
        email_verified=payload.get("email_verified") in (True, "true"),
    )
