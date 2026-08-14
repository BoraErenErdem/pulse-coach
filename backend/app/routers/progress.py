from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.progress import (
    BodyCompositionInsightRead,
    ProgressLogCreate,
    ProgressLogRead,
    ProgressLogUpdate,
    TrendsRead,
    WeeklySummaryRead,
)
from app.services import profile_service, progress_service, trend_service

router = APIRouter(prefix="/progress", tags=["progress"])

# nutrition.py::_MEAL_NOT_FOUND / workouts.py'deki aynı desenle tutarlı
# (2026-08-10 pürüz taraması, Tema C - REST 404 mesajları da dil-duyarlı
# olmalı, sabit Türkçe kalmamalı).
_PROGRESS_LOG_NOT_FOUND = {"tr": "İlerleme kaydı bulunamadı.", "en": "Progress log entry not found."}


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
            waist_cm=payload.waist_cm,
            body_fat_pct=payload.body_fat_pct,
            workout_completed=payload.workout_completed,
            workout_type=payload.workout_type,
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))


@router.get("/logs", response_model=list[ProgressLogRead])
def list_logs(
    days: int | None = None,
    limit: int | None = None,
    offset: int = 0,
    measurements_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return progress_service.list_progress_logs(
        db, current_user.id, days=days, limit=limit, offset=offset, measurements_only=measurements_only
    )


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = progress_service.delete_progress_log(db, current_user.id, log_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PROGRESS_LOG_NOT_FOUND[language])


@router.patch("/logs/{log_id}", response_model=ProgressLogRead)
def update_log(
    log_id: int,
    payload: ProgressLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    language = profile_service.get_language(db, current_user.id)
    try:
        entry = progress_service.update_progress_log(
            db,
            current_user.id,
            log_id,
            weight=payload.weight,
            waist_cm=payload.waist_cm,
            body_fat_pct=payload.body_fat_pct,
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, language)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PROGRESS_LOG_NOT_FOUND[language])
    return entry


@router.get("/weekly-summary", response_model=WeeklySummaryRead)
def weekly_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    summary = progress_service.generate_weekly_summary(db, current_user.id)
    language = profile_service.get_language(db, current_user.id)
    return WeeklySummaryRead(
        log_count=summary.log_count,
        workout_count=summary.workout_count,
        workout_types=summary.workout_types,
        weight_start=summary.weight_start,
        weight_end=summary.weight_end,
        weight_trend=summary.weight_trend,
        streak_weeks=summary.streak_weeks,
        summary_text=summary.as_text(language),
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


@router.get("/body-composition-insight", response_model=BodyCompositionInsightRead)
def body_composition_insight(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kilo değişmese/artsa bile bel çevresi/vücut yağ oranı iyileşmişse
    tartının tek başına göstermediği ilerlemeye dair nazik bir içgörü döner
    (yeterli veri/anlamlı bir sapma yoksa message None döner, frontend kartı
    hiç göstermez) - bkz. progress_service.py::get_body_composition_insight."""
    language = profile_service.get_language(db, current_user.id)
    message = progress_service.get_body_composition_insight(db, current_user.id, language)
    return BodyCompositionInsightRead(message=message)
