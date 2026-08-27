from pydantic import BaseModel


class ExerciseGoalCreate(BaseModel):
    exercise_name: str
    # 2026-08-27: mutually exclusive - ya target_weight_kg (+opsiyonel
    # target_reps) ya da target_duration_minutes (kardiyo/esneklik) gonderilir.
    # Dogrulama exercise_goal_service.set_exercise_goal'da yapilir.
    target_weight_kg: float | None = None
    target_reps: int | None = None
    target_duration_minutes: float | None = None
    exercise_catalog_id: int | None = None


class ExerciseGoalProgressRead(BaseModel):
    id: int
    exercise_name: str
    target_weight_kg: float | None
    best_weight_kg: float | None
    target_reps: int | None
    best_reps: int | None
    target_duration_minutes: float | None
    best_duration_minutes: float | None
    progress_pct: float
