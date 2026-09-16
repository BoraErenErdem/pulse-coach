import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import rate_limit
from app.auth.security import (
    create_access_token,
    create_pending_oauth_token,
    decode_pending_oauth_token,
    verify_password,
)
from app.db.session import get_db
from app.schemas.user import (
    AppleAuthRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    OAuthConsentComplete,
    OAuthResult,
    RefreshRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services import oauth_service, password_reset_service, refresh_token_service, user_service
from app.services.language_resolve import resolve_language
from app.services.oauth_service import OAuthVerificationError, VerifiedIdentity

router = APIRouter(prefix="/auth", tags=["auth"])

# 2026-08-10 pürüz taraması, Tema C - bu endpoint'ler giriş ÖNCESİ çalışır,
# henüz bir UserProfile yok (bkz. resolve_language: istemcinin
# X-Preferred-Language header'ına düşer).
_TOO_MANY_REGISTER = {
    "tr": "Çok fazla kayıt denemesi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many registration attempts. Please try again in {minutes} minutes.",
}
_EMAIL_ALREADY_REGISTERED = {"tr": "Bu e-posta zaten kayıtlı", "en": "This email is already registered"}
_TOO_MANY_LOGIN = {
    "tr": "Çok fazla başarısız giriş denemesi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many failed login attempts. Please try again in {minutes} minutes.",
}
_TOO_MANY_LOGIN_IP = {
    "tr": "Bu adresten çok fazla başarısız giriş denemesi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many failed login attempts from this address. Please try again in {minutes} minutes.",
}
_INVALID_CREDENTIALS = {"tr": "E-posta veya şifre hatalı", "en": "Incorrect email or password"}
_SESSION_EXPIRED = {"tr": "Oturum süresi dolmuş, tekrar giriş yapmalısın", "en": "Your session has expired, please log in again"}
_RESET_LINK_INVALID = {"tr": "Sıfırlama linki geçersiz veya süresi dolmuş", "en": "The reset link is invalid or has expired"}
_OAUTH_INVALID = {"tr": "Giriş doğrulanamadı, tekrar dener misin?", "en": "Sign-in couldn't be verified, please try again"}
_OAUTH_EMAIL_UNVERIFIED = {
    "tr": "Hesabının e-postası doğrulanmamış görünüyor - başka bir yöntemle dener misin?",
    "en": "Your account's email doesn't appear to be verified - please try another method",
}
_OAUTH_PENDING_INVALID = {
    "tr": "Kayıt oturumu geçersiz veya süresi dolmuş, lütfen tekrar dene.",
    "en": "Your sign-up session is invalid or has expired, please try again.",
}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    ip = _client_ip(request)
    if rate_limit.is_locked_out(db, ip, bucket="register", max_attempts=rate_limit.REGISTER_MAX_ATTEMPTS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_REGISTER[language].format(minutes=rate_limit.WINDOW_MINUTES),
        )

    # Sonuç ne olursa olsun (var olan e-posta / başarılı kayıt) sayılır -
    # amaç tek bir IP'den toplu hesap açmayı yavaşlatmak, sadece yanlış
    # denemeleri değil.
    rate_limit.record_failed_attempt(db, ip, bucket="register")

    existing = user_service.get_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_EMAIL_ALREADY_REGISTERED[language])

    return user_service.create_user(
        db,
        payload.email,
        payload.password,
        kvkk_consent=payload.kvkk_consent,
        health_data_consent=payload.health_data_consent,
        terms_consent=payload.terms_consent,
    )


@router.post("/login", response_model=Token)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    ip = _client_ip(request)
    if rate_limit.is_locked_out(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_LOGIN[language].format(minutes=rate_limit.WINDOW_MINUTES),
        )
    # E-posta bazlı sınırın (yukarıda) aksine bu IP bazlı - tek bir IP'den
    # FARKLI e-postalarla düşük-hacimli deneme yapılmasını (password
    # spraying) sınırlıyor (bkz. rate_limit.LOGIN_IP_MAX_ATTEMPTS).
    if rate_limit.is_locked_out(db, ip, bucket="login_ip", max_attempts=rate_limit.LOGIN_IP_MAX_ATTEMPTS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_LOGIN_IP[language].format(minutes=rate_limit.WINDOW_MINUTES),
        )

    user = user_service.get_by_email(db, payload.email)
    # `hashed_password` Google/Apple ile açılmış hesaplarda None (bkz.
    # models/user.py) - bu hesap sahibi parola akışını hiç kullanamaz,
    # None'ı verify_password'a (passlib bir hash string bekliyor, None
    # patlar) hiç geçirmeden aynı "e-posta veya şifre hatalı" yanıtına
    # düşürüyoruz, sağlayıcıyı sızdırmıyoruz.
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        rate_limit.record_failed_attempt(db, payload.email)
        rate_limit.record_failed_attempt(db, ip, bucket="login_ip")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS[language],
        )

    rate_limit.clear_attempts(db, payload.email)
    access_token = create_access_token(subject=str(user.id))
    refresh_token = refresh_token_service.issue_refresh_token(db, user.id)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    result = refresh_token_service.rotate_refresh_token(db, payload.refresh_token)
    if result is None:
        # Token geçersiz/süresi dolmuş olduğu için henüz hangi kullanıcı
        # olduğunu bilmiyoruz - resolve_language(user=None) istemcinin
        # X-Preferred-Language header'ına düşer.
        language = resolve_language(request, db, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_SESSION_EXPIRED[language],
        )
    user, new_refresh_token = result
    access_token = create_access_token(subject=str(user.id))
    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    refresh_token_service.revoke_refresh_token(db, payload.refresh_token)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    # E-posta bazlı sınır aynı hesabı tekrar tekrar hedef almayı sınırlıyor;
    # IP bazlı sınır (register'daki aynı desen) FARKLI e-postalarla toplu
    # deneme yapılmasını (email enumeration/spam) engelliyor. Kilitliyken
    # bile 204 dönülür - kullanıcı var/yok, hangi sınırın tetiklendiği
    # dışarıdan hiç ayırt edilemez.
    ip = _client_ip(request)
    email_locked = rate_limit.is_locked_out(db, payload.email, bucket="forgot_password")
    ip_locked = rate_limit.is_locked_out(
        db, ip, bucket="forgot_password_ip", max_attempts=rate_limit.FORGOT_PASSWORD_IP_MAX_ATTEMPTS
    )
    if not email_locked and not ip_locked:
        rate_limit.record_failed_attempt(db, payload.email, bucket="forgot_password")
        rate_limit.record_failed_attempt(db, ip, bucket="forgot_password_ip")
        password_reset_service.request_password_reset(db, payload.email)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    success = password_reset_service.reset_password(db, payload.token, payload.new_password)
    if not success:
        language = resolve_language(request, db, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_RESET_LINK_INVALID[language],
        )


def _resolve_oauth_identity(db: Session, provider: str, identity: VerifiedIdentity, language: str) -> OAuthResult:
    """Doğrulanmış bir OAuth kimliğini (bkz. oauth_service) bir giriş
    sonucuna çevirir - üç olası yol var, hepsi login/register.md akışına
    KVKK rızası hiçbir zaman atlanmadan bağlanıyor:
    1. Bu sub'a daha önce bu sağlayıcıdan giriş yapılmış -> doğrudan giriş.
    2. Sub yeni ama AYNI DOĞRULANMIŞ e-postayla kayıtlı bir hesap var ->
       o hesaba bu sağlayıcı bağlanır, doğrudan giriş.
    3. Hiçbiri -> hesap AÇILMAZ, rıza ekranı için pending_token dönülür.
    """
    if not identity.email or not identity.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_OAUTH_EMAIL_UNVERIFIED[language])
    normalized_email = identity.email.strip().lower()

    user = user_service.get_by_oauth_sub(db, provider, identity.sub)
    if user is None:
        existing_by_email = user_service.get_by_email(db, normalized_email)
        if existing_by_email is not None:
            user = user_service.link_oauth_sub(db, existing_by_email, provider, identity.sub)

    if user is not None:
        access_token = create_access_token(subject=str(user.id))
        refresh_token = refresh_token_service.issue_refresh_token(db, user.id)
        return OAuthResult(status="logged_in", access_token=access_token, refresh_token=refresh_token)

    pending_token = create_pending_oauth_token(provider, identity.sub, normalized_email)
    return OAuthResult(status="consent_required", pending_token=pending_token, email=normalized_email)


@router.post("/oauth/google", response_model=OAuthResult)
def oauth_google(payload: GoogleAuthRequest, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    try:
        identity = oauth_service.verify_google_id_token(payload.id_token)
    except OAuthVerificationError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_OAUTH_INVALID[language])
    return _resolve_oauth_identity(db, "google", identity, language)


@router.post("/oauth/apple", response_model=OAuthResult)
def oauth_apple(payload: AppleAuthRequest, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    try:
        identity = oauth_service.verify_apple_identity_token(payload.identity_token)
    except OAuthVerificationError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_OAUTH_INVALID[language])
    return _resolve_oauth_identity(db, "apple", identity, language)


@router.post("/oauth/complete", response_model=Token)
def oauth_complete(payload: OAuthConsentComplete, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    try:
        pending = decode_pending_oauth_token(payload.pending_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_OAUTH_PENDING_INVALID[language])

    provider, sub, email = pending["provider"], pending["sub"], pending["email"]
    # pending_token verildiğinden beri aynı e-postayla başka bir yoldan
    # (ör. parolayla, ya da DİĞER sağlayıcıyla) kayıt olunmuş olabilir - bu
    # nadir yarış durumunda yeni bir hesap AÇMAK yerine mevcut hesaba
    # bağlanıyoruz (aynı `_resolve_oauth_identity`'deki 2. yol).
    user = user_service.get_by_oauth_sub(db, provider, sub)
    if user is None:
        existing_by_email = user_service.get_by_email(db, email)
        if existing_by_email is not None:
            user = user_service.link_oauth_sub(db, existing_by_email, provider, sub)
    if user is None:
        user = user_service.create_oauth_user(
            db,
            email,
            provider,
            sub,
            kvkk_consent=payload.kvkk_consent,
            health_data_consent=payload.health_data_consent,
            terms_consent=payload.terms_consent,
        )

    access_token = create_access_token(subject=str(user.id))
    refresh_token = refresh_token_service.issue_refresh_token(db, user.id)
    return Token(access_token=access_token, refresh_token=refresh_token)
