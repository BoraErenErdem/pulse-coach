from datetime import date
from pydantic import BaseModel, ConfigDict


class MoodLogCreate(BaseModel):
    mood_key: str


class MoodLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mood_key: str
    log_date: date
