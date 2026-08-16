from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict


class MoodLogCreate(BaseModel):
    mood_key: str


class MoodLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mood_key: str
    log_date: date


class MoodInsightRead(BaseModel):
    # status ayrımı için bkz. trend_service.py::compute_mood_insight_stats
    # modül-başı yorumu - "insufficient_data" (frontend "birkaç hafta daha
    # kaydet" yer tutucusunu gösterir) ile "no_signal" (ruh hali tutarlı,
    # frontend sessiz kalır) KARIŞTIRILMAMALI. message sadece status="ready"
    # iken dolu.
    message: str | None
    status: Literal["ready", "insufficient_data", "no_signal"]
