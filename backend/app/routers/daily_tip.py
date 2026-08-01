from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.content.daily_tips import CATEGORY_ICONS, get_daily_tip
from app.models.user import User
from app.schemas.daily_tip import DailyTipRead

router = APIRouter(prefix="/daily-tip", tags=["daily-tip"])


@router.get("", response_model=DailyTipRead)
def read_daily_tip(current_user: User = Depends(get_current_user)):
    category, tip = get_daily_tip()
    return DailyTipRead(tip=tip, category=category, icon=CATEGORY_ICONS.get(category, "💡"))
