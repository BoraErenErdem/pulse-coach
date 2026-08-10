from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import rate_limit
from app.auth.security import create_access_token, verify_password
from app.db.session import get_db
from app.schemas.user import (
    ForgotPasswordRequest,
    RefreshRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services import password_reset_service, refresh_token_service, user_service
from app.services.language_resolve import resolve_language

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
_INVALID_CREDENTIALS = {"tr": "E-posta veya şifre hatalı", "en": "Incorrect email or password"}
_SESSION_EXPIRED = {"tr": "Oturum süresi dolmuş, tekrar giriş yapmalısın", "en": "Your session has expired, please log in again"}
_RESET_LINK_INVALID = {"tr": "Sıfırlama linki geçersiz veya süresi dolmuş", "en": "The reset link is invalid or has expired"}


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

    return user_service.create_user(db, payload.email, payload.password)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    language = resolve_language(request, db, None)
    if rate_limit.is_locked_out(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_LOGIN[language].format(minutes=rate_limit.WINDOW_MINUTES),
        )

    user = user_service.get_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        rate_limit.record_failed_attempt(db, payload.email)
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
