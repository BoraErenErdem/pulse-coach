from datetime import date
from pydantic import BaseModel, ConfigDict


class ProgressLogCreate(BaseModel):
    weight: float | None = None
    workout_completed: bool = False
    workout_type: str | None = None


class ProgressLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weight: float | None
    workout_completed: bool
    workout_type: str | None
    log_date: date


class WeeklySummaryRead(BaseModel):
    log_count: int
    workout_count: int
    workout_types: dict[str, int]
    weight_start: float | None
    weight_end: float | None
    weight_trend: float | None
    summary_text: str
