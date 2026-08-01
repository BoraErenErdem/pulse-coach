from pydantic import BaseModel


class DailyTipRead(BaseModel):
    tip: str
    category: str
    icon: str
