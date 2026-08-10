from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.checkin import CheckinMessageRead
from app.services import checkin_service

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.get("", response_model=list[CheckinMessageRead])
def list_checkins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return checkin_service.list_and_mark_delivered(db, current_user.id)
