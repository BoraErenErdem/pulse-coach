from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.profile import ProfileRead, ProfileUpdate
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])

_EMPTY_PROFILE = ProfileRead(
    goal=None,
    activity_level=None,
    dietary_restrictions=None,
    target_weight_kg=None,
    daily_calorie_goal=None,
    daily_protein_goal_g=None,
    daily_carbs_goal_g=None,
    daily_fat_goal_g=None,
    preferred_language="tr",
)


@router.get("", response_model=ProfileRead)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = profile_service.get_profile(db, current_user.id)
    return profile if profile is not None else _EMPTY_PROFILE


@router.patch("", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Hata mesajının hangi dilde döneceğine güncellemeden ÖNCEKİ (geçerli)
    # preferred_language'a göre karar veriyoruz - kullanıcı geçersiz bir dil
    # değeri göndermiş olsa bile mevcut tercihine göre bir mesaj alır.
    language = profile_service.get_language(db, current_user.id)
    try:
        # exclude_unset=True: istemcinin JSON gövdesine hiç KOYMADIĞI alanlar
        # (ör. bu form o alanı hiç yönetmiyorsa) dokunulmadan atlanır; koyduğu
        # ama null gönderdiği alanlar (ör. "Belirtilmemiş" seçilip kaydedilmesi)
        # gerçekten null'a çekilir - bkz. apply_profile_updates docstring'i.
        updates = payload.model_dump(exclude_unset=True)
        return profile_service.apply_profile_updates(db, current_user.id, updates)
    except AppValidationError as exc:
        raise validation_error_to_http(exc, language)
