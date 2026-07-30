from datetime import date
from pydantic import BaseModel, ConfigDict


class MealEntryCreate(BaseModel):
    food_catalog_id: int
    quantity_grams: float
    meal_type: str
    log_date: date | None = None


class MealEntryUpdate(BaseModel):
    quantity_grams: float | None = None
    meal_type: str | None = None


class MealEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    food_catalog_id: int | None
    food_name_snapshot: str
    meal_type: str
    quantity_grams: float
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    log_date: date


class FoodCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_tr: str
    category_tr: str | None
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float | None


class DailyNutritionSummaryRead(BaseModel):
    entry_count: int
    total_calories_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    calorie_goal: float | None
    protein_goal_g: float | None
    carbs_goal_g: float | None
    fat_goal_g: float | None
    summary_text: str
