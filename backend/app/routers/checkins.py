from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.checkin import CheckinMessageRead, UnreadCountRead
from app.services import checkin_service, profile_service

router = APIRouter(prefix="/checkins", tags=["checkins"])

_CHECKIN_NOT_FOUND = {"tr": "Bildirim bulunamadı.", "en": "Notification not found."}


@router.get("", response_model=list[CheckinMessageRead])
def list_checkins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return checkin_service.list_and_mark_delivered(db, current_user.id)


@router.get("/unread-count", response_model=UnreadCountRead)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SALT-OKUNUR - list_checkins'in aksine hiçbir satırı okunmuş
    işaretlemez (bkz. checkin_service.count_unread docstring'i). NavBar/
    mobil menü rozeti bunu kullanır."""
    return {"count": checkin_service.count_unread(db, current_user.id)}


@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_checkins_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    checkin_service.mark_all_read(db, current_user.id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_checkins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tüm bildirimleri siler - boş listede de no-op başarı (204), 404
    fırlatmaz (silinecek hiçbir şey olmaması hata değildir)."""
    checkin_service.delete_all_checkins(db, current_user.id)


@router.delete("/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(
    checkin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = checkin_service.delete_checkin(db, current_user.id, checkin_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_CHECKIN_NOT_FOUND[language])
