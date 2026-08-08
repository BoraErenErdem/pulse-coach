from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.content.daily_tips import get_daily_tip
from app.db.session import get_db
from app.models.user import User
from app.schemas.daily_tip import DailyTipRead
from app.services import profile_service

router = APIRouter(prefix="/daily-tip", tags=["daily-tip"])


@router.get("", response_model=DailyTipRead)
def read_daily_tip(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = profile_service.get_profile(db, current_user.id)
    language = profile.preferred_language if profile is not None else "tr"
    category, tip, icon = get_daily_tip(language)
    return DailyTipRead(tip=tip, category=category, icon=icon)
