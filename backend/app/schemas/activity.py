from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.services.limits import MAX_STEP_SYNC_DAYS


class StepDayIn(BaseModel):
    # Sınırlar servis katmanında (AppValidationError, TR/EN mesaj); burada yalnız tür.
    date: date_type
    steps: int


class StepSyncRequest(BaseModel):
    source: Literal["apple_health"] = "apple_health"
    days: list[StepDayIn] = Field(max_length=MAX_STEP_SYNC_DAYS)


class StepSyncResponse(BaseModel):
    synced_days: int


class StepConsentRead(BaseModel):
    consented_at: datetime
    version: str


class StepDayRead(BaseModel):
    date: date_type
    steps: int
    # Tahmini net yürüme kalorisi; kilo kaydı yoksa null. Kalori hedefine eklenmez.
    calories: float | None


class StepSummaryRead(BaseModel):
    today: StepDayRead
    days: list[StepDayRead]
    average_steps: int | None
    last_synced_at: datetime | None
    has_data: bool
    weight_known: bool
    # Apple Sağlık adım rızası (KVKK 2.1) verilmiş mi; yoksa eşitleme 403 döner.
    consented: bool
