from datetime import date
from pydantic import BaseModel


class DailyTipRead(BaseModel):
    tip: str
    date: date
