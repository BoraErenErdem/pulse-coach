from pydantic import BaseModel, ConfigDict

from app.schemas.types import UtcDateTime


class CheckinMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    message: str
    generated_at: UtcDateTime
    delivered: bool


class UnreadCountRead(BaseModel):
    count: int
