from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.exercise_goal import ExerciseGoal
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet


@dataclass
class ExerciseGoalProgress:
    id: int
    exercise_name: str
    target_weight_kg: float
    best_weight_kg: float | None
    progress_pct: float


def set_exercise_goal(
    db: Session,
    user_id: int,
    exercise_name: str,
    target_weight_kg: float,
    exercise_catalog_id: int | None = None,
) -> ExerciseGoal:
    """Kullanıcının bir egzersiz için ağırlık hedefini kaydeder ya da
    günceller (aynı egzersiz için upsert — kullanıcı başına tek hedef).
    Hem Antrenman Takip Agent tool'u hem de POST /exercise-goals endpoint'i
    bu fonksiyonu çağırır."""
    if target_weight_kg <= 0:
        raise ValueError("Hedef ağırlık sıfırdan büyük olmalı.")

    existing = (
        db.query(ExerciseGoal)
        .filter(
            ExerciseGoal.user_id == user_id,
            func.lower(ExerciseGoal.exercise_name) == exercise_name.strip().lower(),
        )
        .first()
    )
    if existing is not None:
        existing.target_weight_kg = target_weight_kg
        if exercise_catalog_id is not None:
            existing.exercise_catalog_id = exercise_catalog_id
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    goal = ExerciseGoal(
        user_id=user_id,
        exercise_name=exercise_name.strip(),
        target_weight_kg=target_weight_kg,
        exercise_catalog_id=exercise_catalog_id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def delete_exercise_goal(db: Session, user_id: int, goal_id: int) -> bool:
    """Hedefi siler. Bulunamazsa (ya da başka kullanıcıya aitse) False döner."""
    goal = db.query(ExerciseGoal).filter(ExerciseGoal.id == goal_id, ExerciseGoal.user_id == user_id).first()
    if goal is None:
        return False
    db.delete(goal)
    db.commit()
    return True


def _best_weight_for_goal(db: Session, user_id: int, goal: ExerciseGoal) -> float | None:
    query = (
        db.query(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user_id, WorkoutSet.weight_kg.isnot(None))
    )
    if goal.exercise_catalog_id is not None:
        query = query.filter(WorkoutSet.exercise_catalog_id == goal.exercise_catalog_id)
    else:
        query = query.filter(func.lower(WorkoutSet.exercise_name_snapshot) == goal.exercise_name.strip().lower())

    best = query.order_by(WorkoutSet.weight_kg.desc()).first()
    return best.weight_kg if best is not None else None


def list_exercise_goal_progress(db: Session, user_id: int) -> list[ExerciseGoalProgress]:
    """Kullanıcının tüm egzersiz hedeflerini, antrenman geçmişindeki en iyi
    (en ağır) kayıtla karşılaştırılmış ilerleme yüzdesiyle döndürür. Hem
    Antrenman Takip Agent tool'u hem de GET /exercise-goals endpoint'i bu
    fonksiyonu çağırır."""
    goals = (
        db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).order_by(ExerciseGoal.created_at.asc()).all()
    )

    result = []
    for goal in goals:
        best = _best_weight_for_goal(db, user_id, goal)
        pct = min(100.0, (best / goal.target_weight_kg) * 100) if best else 0.0
        result.append(
            ExerciseGoalProgress(
                id=goal.id,
                exercise_name=goal.exercise_name,
                target_weight_kg=goal.target_weight_kg,
                best_weight_kg=best,
                progress_pct=pct,
            )
        )
    return result
