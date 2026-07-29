from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.exercise_goal import ExerciseGoalCreate, ExerciseGoalProgressRead
from app.services import exercise_goal_service

router = APIRouter(prefix="/exercise-goals", tags=["exercise-goals"])


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
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hedef bulunamadı.")
