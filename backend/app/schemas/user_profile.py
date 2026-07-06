from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserProfileUpdate(BaseModel):
    goal: str | None = None
    activity_level: str | None = None
    dietary_restrictions: str | None = None


class UserProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    goal: str | None
    activity_level: str | None
    dietary_restrictions: str | None
    created_at: datetime
    updated_at: datetime
