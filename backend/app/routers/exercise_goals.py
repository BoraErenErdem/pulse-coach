from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.exercise_goal import ExerciseGoalCreate, ExerciseGoalProgressRead
from app.services import exercise_goal_service, profile_service

router = APIRouter(prefix="/exercise-goals", tags=["exercise-goals"])

# 2026-08-10 pürüz taraması, Tema C - bkz. nutrition.py/workouts.py'deki aynı desen.
_GOAL_NOT_FOUND = {"tr": "Hedef bulunamadı.", "en": "Goal not found."}


@router.post("", response_model=ExerciseGoalProgressRead)
def set_goal(
    payload: ExerciseGoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        goal = exercise_goal_service.set_exercise_goal(
            db,
            current_user.id,
            exercise_name=payload.exercise_name,
            target_weight_kg=payload.target_weight_kg,
            exercise_catalog_id=payload.exercise_catalog_id,
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))

    progress = next(
        (p for p in exercise_goal_service.list_exercise_goal_progress(db, current_user.id) if p.id == goal.id),
        None,
    )
    return progress


@router.get("", response_model=list[ExerciseGoalProgressRead])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exercise_goal_service.list_exercise_goal_progress(db, current_user.id)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = exercise_goal_service.delete_exercise_goal(db, current_user.id, goal_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_GOAL_NOT_FOUND[language])
