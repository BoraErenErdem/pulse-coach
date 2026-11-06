from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, resolve_validation_message, validation_error_to_http
from app.models.user import User
from app.schemas.activity import StepConsentRead, StepDayRead, StepSummaryRead, StepSyncRequest, StepSyncResponse
from app.services import step_service
from app.services.language_resolve import resolve_language
from app.services.limits import MAX_STEP_SYNC_DAYS

# Günlük adım (2026-11-06): mobil Apple Sağlık'tan okuyup PUT ile eşitler, web
# ve mobil GET ile gösterir. Ayrıntı: services/step_service.py.
router = APIRouter(prefix="/activity", tags=["activity"])


def _utc(value: datetime | None) -> datetime | None:
    # DB'deki zaman damgaları saf UTC; işaretsiz giderse istemci yerel saat sanıp kaydırır.
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def _day(day: step_service.StepDay) -> StepDayRead:
    return StepDayRead(date=day.day, steps=day.steps, calories=day.calories)


@router.put("/steps", response_model=StepSyncResponse)
def sync_steps(
    request: Request,
    payload: StepSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        count = step_service.sync_steps(
            db, current_user.id, [(d.date, d.steps) for d in payload.days], source=payload.source
        )
    except step_service.StepsConsentRequired as exc:
        language = resolve_language(request, db, current_user)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resolve_validation_message(exc, language))
    except AppValidationError as exc:
        raise validation_error_to_http(exc, resolve_language(request, db, current_user))
    return StepSyncResponse(synced_days=count)


@router.post("/steps/consent", response_model=StepConsentRead)
def give_steps_consent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apple Sağlık bağlanırken gösterilen açık rıza metninin (KVKK 2.1) onayı."""
    consented_at = step_service.give_steps_consent(db, current_user.id)
    return StepConsentRead(consented_at=consented_at, version=step_service.STEPS_CONSENT_VERSION)


@router.get("/steps", response_model=StepSummaryRead)
def get_steps(
    days: int = Query(7, ge=1, le=MAX_STEP_SYNC_DAYS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    summary = step_service.get_step_summary(db, current_user.id, days=days)
    return StepSummaryRead(
        today=_day(summary.today),
        days=[_day(d) for d in summary.days],
        average_steps=summary.average_steps,
        last_synced_at=_utc(summary.last_synced_at),
        has_data=summary.has_data,
        weight_known=summary.weight_known,
        consented=summary.consented,
    )


@router.delete("/steps", status_code=status.HTTP_204_NO_CONTENT)
def delete_steps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apple Sağlık bağlantısı kesilince: rıza geri çekilir, eşitlenmiş tüm adım verisi silinir."""
    step_service.delete_all_steps(db, current_user.id)
