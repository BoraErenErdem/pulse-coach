from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import rate_limit
from app.auth.dependencies import get_current_user
from app.auth.security import verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import DeleteAccountRequest, PushTokenUpdate, UserRead
from app.services import data_export_service, profile_service, push_service

router = APIRouter(prefix="/users", tags=["users"])

# 2026-08-10 sekme mimarisi incelemesi - auth/router.py'deki login'le AYNI
# gerekçe: şifre doğrulaması yapan bir endpoint, hiç rate limit'i yoktu.
# Çalıntı bir access token'la (ör. XSS) bu endpoint'e karşı sınırsız şifre
# denemesi yapılabiliyordu - hesap silinmese bile şifre böyle öğrenilebilirdi.
_WRONG_PASSWORD = {"tr": "Şifre hatalı", "en": "Incorrect password"}
_TOO_MANY_ATTEMPTS = {
    "tr": "Çok fazla başarısız deneme. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many failed attempts. Please try again in {minutes} minutes.",
}


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
def update_push_token(
    payload: PushTokenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Expo push token'ını kaydeder/temizler - expo_push_token User
    tablosunda yaşıyor (bir profil tercihi değil, cihaz kaydı), bu yüzden
    /profile PATCH'e KATILMIYOR, users_router'ın diğer User-tablosu/cihaz-
    hesabı endpoint'leriyle (export, delete) aynı yerde."""
    push_service.set_push_token(db, current_user, payload.expo_push_token)


@router.get("/me/export")
def export_current_user_data(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Kullanıcının sahip olduğu tüm veriyi (GDPR-tarzı "verini indir") tek
    bir JSON belgesi olarak döndürür."""
    return data_export_service.export_user_data(db, current_user.id)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_current_user(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hesabı ve sahip olduğu TÜM veriyi kalıcı olarak siler (User modelindeki
    cascade="all, delete-orphan" relationship'leri sayesinde profil/öğün/
    ilerleme/sohbet/mood/checkin/egzersiz/refresh-token'lar da otomatik
    silinir). Geri alınamaz bir işlem olduğu için mevcut şifrenin tekrar
    girilmesi zorunlu - ele geçirilmiş bir oturumun tek bir istekle hesabı
    silmesini engeller."""
    language = profile_service.get_language(db, current_user.id)
    if rate_limit.is_locked_out(db, current_user.email, bucket="delete_account"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_ATTEMPTS[language].format(minutes=rate_limit.WINDOW_MINUTES),
        )
    if not verify_password(payload.password, current_user.hashed_password):
        rate_limit.record_failed_attempt(db, current_user.email, bucket="delete_account")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_WRONG_PASSWORD[language])
    db.delete(current_user)
    db.commit()
