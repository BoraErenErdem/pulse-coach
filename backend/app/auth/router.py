from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import rate_limit
from app.auth.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    ForgotPasswordRequest,
    RefreshRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services import password_reset_service, refresh_token_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if rate_limit.is_locked_out(db, ip, bucket="register", max_attempts=rate_limit.REGISTER_MAX_ATTEMPTS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Çok fazla kayıt denemesi. {rate_limit.WINDOW_MINUTES} dakika sonra tekrar deneyin.",
        )

    # Sonuç ne olursa olsun (var olan e-posta / başarılı kayıt) sayılır -
    # amaç tek bir IP'den toplu hesap açmayı yavaşlatmak, sadece yanlış
    # denemeleri değil.
    rate_limit.record_failed_attempt(db, ip, bucket="register")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e-posta zaten kayıtlı")

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    if rate_limit.is_locked_out(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Çok fazla başarısız giriş denemesi. {rate_limit.WINDOW_MINUTES} dakika sonra tekrar deneyin.",
        )

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        rate_limit.record_failed_attempt(db, payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı",
        )

    rate_limit.clear_attempts(db, payload.email)
    access_token = create_access_token(subject=str(user.id))
    refresh_token = refresh_token_service.issue_refresh_token(db, user.id)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    result = refresh_token_service.rotate_refresh_token(db, payload.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi dolmuş, tekrar giriş yapmalısın",
        )
    user, new_refresh_token = result
    access_token = create_access_token(subject=str(user.id))
    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    refresh_token_service.revoke_refresh_token(db, payload.refresh_token)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Kilitliyken bile 204 dönülür (kullanıcı var/yok, kilitli/değil hiçbiri
    # dışarıdan ayırt edilemez) - enumeration + spam koruması bir arada.
    if not rate_limit.is_locked_out(db, payload.email, bucket="forgot_password"):
        rate_limit.record_failed_attempt(db, payload.email, bucket="forgot_password")
        password_reset_service.request_password_reset(db, payload.email)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    success = password_reset_service.reset_password(db, payload.token, payload.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sıfırlama linki geçersiz veya süresi dolmuş",
        )
