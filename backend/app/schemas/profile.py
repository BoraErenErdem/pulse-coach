from pydantic import BaseModel, ConfigDict


class ProfileUpdate(BaseModel):
    goal: str | None = None
    activity_level: str | None = None
    dietary_restrictions: str | None = None
    target_weight_kg: float | None = None
    daily_calorie_goal: float | None = None
    daily_protein_goal_g: float | None = None
    daily_carbs_goal_g: float | None = None
    daily_fat_goal_g: float | None = None
    preferred_language: str | None = None
    coach_tone: str | None = None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    goal: str | None
    activity_level: str | None
    dietary_restrictions: str | None
    target_weight_kg: float | None
    daily_calorie_goal: float | None
    daily_protein_goal_g: float | None
    daily_carbs_goal_g: float | None
    daily_fat_goal_g: float | None
    preferred_language: str
    coach_tone: str | None
