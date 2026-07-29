from pydantic import BaseModel


class ExerciseGoalCreate(BaseModel):
    exercise_name: str
    target_weight_kg: float
    exercise_catalog_id: int | None = None


class ExerciseGoalProgressRead(BaseModel):
    id: int
    exercise_name: str
    target_weight_kg: float
    best_weight_kg: float | None
    progress_pct: float
