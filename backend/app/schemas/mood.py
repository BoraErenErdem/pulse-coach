from datetime import date
from pydantic import BaseModel, ConfigDict


class MoodLogCreate(BaseModel):
    mood_key: str


class MoodLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mood_key: str
    log_date: date


class MoodInsightRead(BaseModel):
    # message None ise (yeterli/anlamlı bir sinyal yok) frontend kartı hiç
    # göstermez - bkz. trend_service.py::compute_mood_insight_stats.
    message: str | None
