from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.workout import (
    WorkoutSessionCreate,
    WorkoutSessionRead,
    WorkoutSessionUpdate,
    WorkoutSetUpdate,
    WorkoutSummaryRead,
)
from app.services import profile_service, workout_service
from app.services.workout_service import SetInput

# Katalog arama catalog.py'a taşındı (2026-08-10 mimari borç raporu, bulgu
# #6) - endpoint yolu (/workouts/exercises/search) DEĞİŞMEDİ.
router = APIRouter(prefix="/workouts", tags=["workouts"])

# 2026-08-10 pürüz taraması, Tema C - bkz. nutrition.py'deki aynı desen.
_SESSION_NOT_FOUND = {"tr": "Antrenman oturumu bulunamadı.", "en": "Workout session not found."}
_SET_NOT_FOUND = {"tr": "Set bulunamadı.", "en": "Set not found."}


@router.post("/sessions", response_model=WorkoutSessionRead)
def log_session(
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return workout_service.log_workout_session(
            db,
            current_user.id,
            sets=[SetInput(**set_payload.model_dump()) for set_payload in payload.sets],
            session_date=payload.session_date,
            workout_type=payload.workout_type,
            note=payload.note,
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))


@router.get("/sessions", response_model=list[WorkoutSessionRead])
def list_sessions(
    days: int | None = None,
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return workout_service.list_workout_sessions(db, current_user.id, days=days, limit=limit)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = workout_service.delete_workout_session(db, current_user.id, session_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_SESSION_NOT_FOUND[language])


@router.patch("/sessions/{session_id}", response_model=WorkoutSessionRead)
def update_session(
    session_id: int,
    payload: WorkoutSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        session = workout_service.update_workout_session(
            db, current_user.id, session_id, workout_type=payload.workout_type, note=payload.note
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))
    if session is None:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_SESSION_NOT_FOUND[language])
    return session


@router.patch("/sessions/{session_id}/sets/{set_id}", response_model=WorkoutSessionRead)
def update_set(
    session_id: int,
    set_id: int,
    payload: WorkoutSetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workout_set = workout_service.update_workout_set(
        db,
        current_user.id,
        session_id,
        set_id,
        reps=payload.reps,
        weight_kg=payload.weight_kg,
        duration_minutes=payload.duration_minutes,
        intensity=payload.intensity,
        cardio_category=payload.cardio_category,
    )
    if workout_set is None:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_SET_NOT_FOUND[language])
    return workout_set.session


@router.delete("/sessions/{session_id}/sets/{set_id}", response_model=WorkoutSessionRead)
def delete_set(
    session_id: int,
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = workout_service.delete_workout_set(db, current_user.id, session_id, set_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_SET_NOT_FOUND[language])
    return workout_service.get_workout_session(db, current_user.id, session_id)


@router.get("/summary", response_model=WorkoutSummaryRead)
def summary(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = workout_service.generate_workout_summary(db, current_user.id, days=days)
    language = profile_service.get_language(db, current_user.id)
    return WorkoutSummaryRead(
        session_count=result.session_count,
        total_sets=result.total_sets,
        total_volume_kg=result.total_volume_kg,
        sets_by_exercise=result.sets_by_exercise,
        summary_text=result.as_text(language),
        total_calories_burned=result.total_calories_burned,
    )
