from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.progress import ProgressLogCreate, ProgressLogRead, TrendsRead, WeeklySummaryRead
from app.services import progress_service, trend_service

router = APIRouter(prefix="/progress", tags=["progress"])


@router.post("/log", response_model=ProgressLogRead)
def log_progress(
    payload: ProgressLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return progress_service.log_progress(
            db,
            current_user.id,
            weight=payload.weight,
            workout_completed=payload.workout_completed,
            workout_type=payload.workout_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.get("/logs", response_model=list[ProgressLogRead])
def list_logs(
    days: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return progress_service.list_progress_logs(db, current_user.id, days=days)


@router.get("/weekly-summary", response_model=WeeklySummaryRead)
def weekly_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    summary = progress_service.generate_weekly_summary(db, current_user.id)
    return WeeklySummaryRead(
        log_count=summary.log_count,
        workout_count=summary.workout_count,
        workout_types=summary.workout_types,
        weight_start=summary.weight_start,
        weight_end=summary.weight_end,
        weight_trend=summary.weight_trend,
        streak_weeks=summary.streak_weeks,
        summary_text=summary.as_text(),
    )


@router.get("/trends", response_model=TrendsRead)
def trends(
    weeks: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Son `weeks` hafta için mood/beslenme/egzersiz/kilo trendini + egzersiz
    günleri ile ortalama ruh hali arasındaki basit korelasyonu döner."""
    points = trend_service.generate_weekly_trends(db, current_user.id, weeks=weeks)
    return TrendsRead(
        points=points,
        mood_workout_correlation=trend_service.mood_workout_correlation(points),
    )
