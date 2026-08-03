from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.security import verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import DeleteAccountRequest, UserRead
from app.services import data_export_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


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
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Şifre hatalı")
    db.delete(current_user)
    db.commit()
