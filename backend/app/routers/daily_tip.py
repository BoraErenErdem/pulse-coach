from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.content.daily_tips import get_daily_tip
from app.models.user import User
from app.schemas.daily_tip import DailyTipRead

router = APIRouter(prefix="/daily-tip", tags=["daily-tip"])


@router.get("", response_model=DailyTipRead)
def read_daily_tip(current_user: User = Depends(get_current_user)):
    tip = get_daily_tip()
    return DailyTipRead(
        tip_tr=tip.tip_tr,
        tip_en=tip.tip_en,
        category_tr=tip.category_tr,
        category_en=tip.category_en,
        icon=tip.icon,
    )
