from datetime import date
from pydantic import BaseModel, ConfigDict


class WorkoutSetCreate(BaseModel):
    exercise_name: str
    reps: int
    weight_kg: float | None = None
    set_number: int | None = None
    exercise_catalog_id: int | None = None


class WorkoutSessionCreate(BaseModel):
    session_date: date | None = None
    workout_type: str | None = None
    note: str | None = None
    sets: list[WorkoutSetCreate]


class WorkoutSessionUpdate(BaseModel):
    workout_type: str | None = None
    note: str | None = None


class WorkoutSetUpdate(BaseModel):
    reps: int | None = None
    weight_kg: float | None = None


class WorkoutSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_catalog_id: int | None
    exercise_name_snapshot: str
    set_number: int
    reps: int
    weight_kg: float | None
    is_personal_record: bool


class WorkoutSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_date: date
    workout_type: str | None
    note: str | None
    sets: list[WorkoutSetRead]


class ExerciseCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_tr: str
    name_en: str
    category_tr: str
    equipment_tr: str | None
    primary_muscles_tr: str
    secondary_muscles_tr: str | None
    level_tr: str
    instructions_tr: str | None


class WorkoutSummaryRead(BaseModel):
    session_count: int
    total_sets: int
    total_volume_kg: float
    sets_by_exercise: dict[str, int]
    summary_text: str
