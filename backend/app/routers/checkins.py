from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.checkin_message import CheckinMessage
from app.models.user import User
from app.schemas.checkin import CheckinMessageRead

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.get("", response_model=list[CheckinMessageRead])
def list_checkins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    messages = (
        db.query(CheckinMessage)
        .filter(CheckinMessage.user_id == current_user.id)
        .order_by(CheckinMessage.generated_at.desc())
        .all()
    )
    result = [CheckinMessageRead.model_validate(message) for message in messages]

    now = datetime.now(timezone.utc)
    for message in messages:
        if not message.delivered:
            message.delivered = True
            message.delivered_at = now
    db.commit()

    return result
