from pydantic import BaseModel, ConfigDict


class ProfileUpdate(BaseModel):
    goal: str | None = None
    activity_level: str | None = None
    dietary_restrictions: str | None = None
    target_weight_kg: float | None = None
    target_waist_cm: float | None = None
    target_body_fat_pct: float | None = None
    daily_calorie_goal: float | None = None
    daily_protein_goal_g: float | None = None
    daily_carbs_goal_g: float | None = None
    daily_fat_goal_g: float | None = None
    weekly_workout_goal_days: int | None = None
    preferred_language: str | None = None
    coach_tone: str | None = None
    display_name: str | None = None
    daily_nudge_enabled: bool | None = None
    weekly_summary_enabled: bool | None = None
    daily_nudge_hour: int | None = None
    height_cm: float | None = None
    birth_year: int | None = None
    sex: str | None = None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    goal: str | None
    activity_level: str | None
    dietary_restrictions: str | None
    target_weight_kg: float | None
    target_waist_cm: float | None
    target_body_fat_pct: float | None
    daily_calorie_goal: float | None
    daily_protein_goal_g: float | None
    daily_carbs_goal_g: float | None
    daily_fat_goal_g: float | None
    weekly_workout_goal_days: int | None = None
    preferred_language: str
    coach_tone: str | None
    display_name: str | None = None
    daily_nudge_enabled: bool = True
    weekly_summary_enabled: bool = True
    daily_nudge_hour: int | None = None
    height_cm: float | None = None
    birth_year: int | None = None
    sex: str | None = None


class CalorieRecommendation(BaseModel):
    """GET /profile/calorie-recommendation - `available` False iken sayısal
    alanlar None, `missing` eksik bilgileri listeler (height, birth_year, sex,
    weight, activity_level)."""

    available: bool
    missing: list[str]
    calories: int | None = None
    protein_g: int | None = None
    carbs_g: int | None = None
    fat_g: int | None = None
    bmr: int | None = None
    tdee: int | None = None
    adjustment_kcal: int | None = None
    goal: str | None = None
    activity_level: str | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    age: int | None = None
    sex: str | None = None
