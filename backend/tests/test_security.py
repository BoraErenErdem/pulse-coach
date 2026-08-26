"""2026-08-26 güvenlik denetiminde eklenen fix'lerin regresyon testleri.

IDOR/izolasyon senaryoları BİLEREK burada tekrarlanmıyor - test_isolation.py,
test_workouts.py, test_checkins.py, test_mood.py, test_nutrition_log.py
içinde her kaynak türü için zaten kapsamlı cross-user testleri var (denetim
sırasında doğrulandı, gerçek bir zafiyet bulunmadı). Bu dosya SADECE
2026-08-26 turunda değişen/eklenen davranışı kapsıyor: JWT tahrifatı, login
IP-bazlı rate limit, foto yükleme magic-byte doğrulaması, güvenlik
header'ları, şifre sıfırlama linkinin log'a düz metin yazılmaması."""

import base64
import json
import logging
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings


def _register_and_login(client, email="security-test@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# JWT tahrifatı
# ---------------------------------------------------------------------------


def test_tampered_signature_is_rejected(client):
    headers = _register_and_login(client, email="jwt-tamper@example.com")
    token = headers["Authorization"].split(" ")[1]
    # Son birkaç karakteri (imzanın bir parçası) bozuyoruz - payload/header
    # aynı kalıyor ama imza artık geçersiz.
    tampered = token[:-4] + ("a" * 4 if token[-4:] != "aaaa" else "bbbb")

    response = client.get("/users/me", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401


def test_expired_token_is_rejected(client):
    settings = get_settings()
    email = "jwt-expired@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    login_body = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()
    # user id'yi almak için /users/me'ye gerçek token'la bir kere gidiyoruz.
    me = client.get(
        "/users/me", headers={"Authorization": f"Bearer {login_body['access_token']}"}
    ).json()

    expired_payload = {
        "sub": str(me["id"]),
        "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    response = client.get("/users/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401


def test_alg_none_token_is_rejected(client):
    """decode_access_token, jwt.decode'a algorithms=[settings.jwt_algorithm]
    (sabit HS256) veriyor - PyJWT bu durumda token'ın KENDİ header'ındaki
    alg'ı KABUL ETMEZ, alg="none" (imzasız) bir token her zaman reddedilir.
    Bu bir regresyon testi - kod değişmedi, mevcut güvenli davranış
    doğrulanıyor."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "1", "exp": 9999999999}).encode()
    ).rstrip(b"=")
    forged_token = f"{header.decode()}.{payload.decode()}."

    response = client.get("/users/me", headers={"Authorization": f"Bearer {forged_token}"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Login IP-bazlı rate limit (2026-08-26 eklendi)
# ---------------------------------------------------------------------------


def test_login_rate_limits_by_ip_across_different_emails(client, monkeypatch):
    """E-posta bazlı sınır (test_auth.py'deki mevcut testler) aynı hesabı
    hedef alan denemeleri sınırlıyor ama tek bir IP'den FARKLI e-postalarla
    düşük-hacimli deneme (password spraying) yapılmasını YAKALAMAZDI - IP
    bazlı sınır bunun için (forgot-password'daki aynı desen)."""
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "LOGIN_IP_MAX_ATTEMPTS", 3)

    for i in range(3):
        response = client.post(
            "/auth/login", json={"email": f"spray-{i}@example.com", "password": "wrong"}
        )
        assert response.status_code == 401

    # Geçerli bir hesap ve DOĞRU şifreyle bile - IP kilitli olduğu için 429.
    email = "spray-victim@example.com"
    client.post("/auth/register", json={"email": email, "password": "supersecret"})
    locked_response = client.post("/auth/login", json={"email": email, "password": "supersecret"})
    assert locked_response.status_code == 429


def test_login_ip_lockout_message_is_distinct_from_email_lockout_message(client, monkeypatch):
    """IP bazlı kilit e-posta bazlı kilitle AYNI genel mesajı kullanmıyor
    (_TOO_MANY_LOGIN_IP) - kullanıcıya (ve bunu debug eden geliştiriciye)
    hangi sınırın tetiklendiği ayırt edilebilir kalsın diye."""
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "MAX_ATTEMPTS", 100)  # email bazlı kilidi bu testte devre dışı bırak
    monkeypatch.setattr(rate_limit, "LOGIN_IP_MAX_ATTEMPTS", 2)

    for i in range(2):
        client.post("/auth/login", json={"email": f"ip-only-{i}@example.com", "password": "wrong"})

    response = client.post("/auth/login", json={"email": "ip-only-final@example.com", "password": "wrong"})
    assert response.status_code == 429
    expected_detail = f"Bu adresten çok fazla başarısız giriş denemesi. {rate_limit.WINDOW_MINUTES} dakika sonra tekrar deneyin."
    assert response.json()["detail"] == expected_detail


# ---------------------------------------------------------------------------
# Şifre sıfırlama linkinin log'a düz metin yazılmaması (2026-08-26)
# ---------------------------------------------------------------------------


def test_password_reset_token_is_not_logged_in_plain_text(caplog, monkeypatch):
    # Doğrudan servis fonksiyonunu çağırıyoruz (test_email_service.py'deki
    # AYNI desen) - TestClient'ın ASGI transport'u isteği ayrı bir thread'de
    # çalıştırabiliyor, caplog'un handler'ı bu durumda güvenilir yakalamıyor;
    # doğrudan çağrı aynı thread'de çalışıp bu belirsizliği ortadan kaldırıyor.
    from app.config import get_settings
    from app.services import email_service

    # Gerçek .env'de SMTP_HOST tanımlı (bkz. proje belleği) - dev-modu log
    # dalını (test edilmek istenen) tetiklemek için burada None'a çekiyoruz,
    # aksi halde bu test GERÇEK bir SMTP bağlantısı deneyip ağa çıkardı
    # (test_email_service.py'deki AYNI güvenlik önlemi).
    monkeypatch.setattr(get_settings(), "smtp_host", None)

    with caplog.at_level(logging.INFO, logger="app.services.email_service"):
        email_service.send_password_reset_email(
            "reset-log-redaction@example.com",
            "http://localhost:3000/reset-password?token=super-secret-raw-token-value",
        )

    log_text = "\n".join(record.getMessage() for record in caplog.records)
    assert "reset-password?token=" in log_text  # linkin YOLU hâlâ loglanıyor
    # "token=" sonrasında ham token DEĞİL, redaksiyon işareti olmalı - ham
    # token secrets.token_urlsafe(48) ile üretiliyor (en az 48 karakter),
    # bu yüzden "token=[REDACTED]" dışında bir şey görülmemeli.
    assert "token=[REDACTED]" in log_text
    assert "super-secret-raw-token-value" not in log_text


# ---------------------------------------------------------------------------
# Foto yükleme magic-byte doğrulaması (2026-08-26 eklendi)
# ---------------------------------------------------------------------------


def test_photo_analyze_rejects_mismatched_magic_bytes(client):
    """Content-Type "image/jpeg" iddia ediliyor ama gerçek baytlar bir JPEG
    imzasıyla (FF D8 FF) başlamıyor - önceden sadece Content-Type'a
    güveniliyordu, artık dosya imzası da kontrol ediliyor."""
    headers = _register_and_login(client, email="photo-magic-byte@example.com")
    response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", b"this-is-not-a-real-jpeg-file", "image/jpeg")},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Desteklenmeyen dosya türü (sadece JPEG/PNG/WEBP)."


def test_photo_analyze_accepts_real_jpeg_signature(client, monkeypatch):
    """Regresyon: gerçek imzalı (ama küçük/sahte) bir JPEG hâlâ kabul
    edilmeli - fix aşırı sıkı olup meşru fotoğrafları reddetmemeli."""
    from app.services import photo_meal_service
    from tests.test_photo_meal import FAKE_JPEG_BYTES, _fake_llm

    monkeypatch.setattr(
        photo_meal_service, "get_llm", lambda **_kwargs: _fake_llm("[]")
    )
    headers = _register_and_login(client, email="photo-magic-byte-valid@example.com")
    response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=headers,
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Güvenlik header'ları (2026-08-26 eklendi)
# ---------------------------------------------------------------------------


def test_responses_include_security_headers(client):
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_cors_preflight_reflects_tightened_methods_and_headers(client):
    """Regresyon: allow_methods/allow_headers eskiden "*" idi - artık gerçekte
    kullanılan yöntem/header'lara daraltıldı (bkz. app/main.py)."""
    from app.config import get_settings as _get_settings

    allowed_origin = _get_settings().cors_allowed_origins_list[0]
    response = client.options(
        "/auth/login",
        headers={
            "Origin": allowed_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code in (200, 204)
    assert "GET" in response.headers.get("access-control-allow-methods", "")
    assert "authorization" in response.headers.get("access-control-allow-headers", "").lower()
