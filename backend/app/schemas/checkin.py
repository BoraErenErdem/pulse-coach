from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CheckinMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message: str
    generated_at: datetime
    delivered: bool
