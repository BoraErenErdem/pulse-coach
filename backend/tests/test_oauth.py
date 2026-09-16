# Google/Apple ile giriş (2026-09-16) - gerçek Google/Apple imza doğrulaması
# burada test EDİLMİYOR (o, google-auth/PyJWT kütüphanelerinin kendi
# sorumluluğu) - bunun yerine `oauth_service.verify_*` fonksiyonları
# monkeypatch'lenip router'ın orkestrasyon mantığı (yeni kullanıcı ->
# pending_token -> /complete; var olan sub -> doğrudan giriş; aynı
# doğrulanmış e-postayla var olan hesaba otomatik bağlanma) test ediliyor.
from app.auth import router as auth_router
from app.services.oauth_service import VerifiedIdentity


def _patch_google(monkeypatch, *, sub="google-sub-1", email="oauth@example.com", verified=True):
    monkeypatch.setattr(
        auth_router.oauth_service,
        "verify_google_id_token",
        lambda token: VerifiedIdentity(sub=sub, email=email, email_verified=verified),
    )


def _patch_apple(monkeypatch, *, sub="apple-sub-1", email="oauth@example.com", verified=True):
    monkeypatch.setattr(
        auth_router.oauth_service,
        "verify_apple_identity_token",
        lambda token: VerifiedIdentity(sub=sub, email=email, email_verified=verified),
    )


def test_google_new_user_requires_consent_before_account_exists(client, monkeypatch):
    _patch_google(monkeypatch, email="newgoogle@example.com")
    response = client.post("/auth/oauth/google", json={"id_token": "fake"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "consent_required"
    assert body["pending_token"]
    assert body["access_token"] is None
    assert body["email"] == "newgoogle@example.com"

    # Rıza tamamlanana kadar bu e-postayla NORMAL kayıt hâlâ mümkün olmalı -
    # yani pending durum hiçbir User satırı YARATMADI.
    register = client.post(
        "/auth/register",
        json={
            "email": "newgoogle@example.com",
            "password": "supersecret",
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    assert register.status_code == 201


def test_google_complete_creates_user_and_logs_in(client, monkeypatch):
    _patch_google(monkeypatch, email="completegoogle@example.com")
    verify = client.post("/auth/oauth/google", json={"id_token": "fake"})
    pending_token = verify.json()["pending_token"]

    complete = client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": pending_token,
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    assert complete.status_code == 200
    body = complete.json()
    assert body["access_token"]
    assert body["refresh_token"]

    me = client.get("/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "completegoogle@example.com"


def test_google_complete_rejects_missing_consent(client, monkeypatch):
    _patch_google(monkeypatch, email="noconsent@example.com")
    verify = client.post("/auth/oauth/google", json={"id_token": "fake"})
    pending_token = verify.json()["pending_token"]

    complete = client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": pending_token,
            "kvkk_consent": True,
            "health_data_consent": False,
            "terms_consent": True,
        },
    )
    assert complete.status_code == 422


def test_google_login_is_direct_once_sub_is_linked(client, monkeypatch):
    _patch_google(monkeypatch, sub="repeat-sub", email="repeatgoogle@example.com")
    verify1 = client.post("/auth/oauth/google", json={"id_token": "fake"})
    client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": verify1.json()["pending_token"],
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )

    # AYNI sub ile tekrar giriş - artık doğrudan token dönmeli, pending YOK.
    verify2 = client.post("/auth/oauth/google", json={"id_token": "fake"})
    body = verify2.json()
    assert body["status"] == "logged_in"
    assert body["access_token"]
    assert body["pending_token"] is None


def test_google_links_to_existing_password_account_with_same_verified_email(client, monkeypatch):
    client.post(
        "/auth/register",
        json={
            "email": "linkme@example.com",
            "password": "supersecret",
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    _patch_google(monkeypatch, email="linkme@example.com")
    response = client.post("/auth/oauth/google", json={"id_token": "fake"})
    body = response.json()
    # Yeni bir hesap AÇILMIYOR - mevcut parolalı hesaba bağlanıp doğrudan
    # giriş yapılıyor.
    assert body["status"] == "logged_in"
    assert body["access_token"]

    # Parolayla giriş de hâlâ çalışıyor - bağlama parolayı SİLMEDİ.
    password_login = client.post("/auth/login", json={"email": "linkme@example.com", "password": "supersecret"})
    assert password_login.status_code == 200


def test_google_rejects_unverified_email(client, monkeypatch):
    _patch_google(monkeypatch, email="unverified@example.com", verified=False)
    response = client.post("/auth/oauth/google", json={"id_token": "fake"})
    assert response.status_code == 400


def test_apple_new_user_flow_is_independent_of_google(client, monkeypatch):
    _patch_apple(monkeypatch, email="appleuser@example.com")
    verify = client.post("/auth/oauth/apple", json={"identity_token": "fake"})
    body = verify.json()
    assert body["status"] == "consent_required"

    complete = client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": body["pending_token"],
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    assert complete.status_code == 200


def test_password_login_fails_cleanly_for_oauth_only_account(client, monkeypatch):
    _patch_google(monkeypatch, email="oauthonly@example.com")
    verify = client.post("/auth/oauth/google", json={"id_token": "fake"})
    client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": verify.json()["pending_token"],
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )

    # OAuth-only hesapta hiç şifre yok - password login 500 DEĞİL, normal
    # "e-posta veya şifre hatalı" 401'i vermeli (bkz. router.py'deki
    # `not user.hashed_password` koruması).
    response = client.post("/auth/login", json={"email": "oauthonly@example.com", "password": "anything"})
    assert response.status_code == 401


def test_oauth_complete_rejects_invalid_pending_token(client):
    response = client.post(
        "/auth/oauth/complete",
        json={
            "pending_token": "not-a-real-token",
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    assert response.status_code == 400
