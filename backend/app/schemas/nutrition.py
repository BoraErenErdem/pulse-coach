from datetime import date, datetime
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
    sugar_g: float | None
    sodium_mg: float | None
    fiber_g: float | None
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
    sugar_g: float | None
    sodium_mg: float | None


class PhotoMealItemRead(BaseModel):
    food_name: str
    estimated_grams: float
    matched_food: FoodCatalogRead | None
    candidates: list[FoodCatalogRead]
    is_uncertain: bool = False


class PhotoMealAnalysisRead(BaseModel):
    items: list[PhotoMealItemRead]


class MealPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    detected_items_summary: str
    created_at: datetime


class DailyNutritionSummaryRead(BaseModel):
    entry_count: int
    total_calories_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    total_sugar_g: float
    total_sodium_mg: float
    total_fiber_g: float
    calorie_goal: float | None
    protein_goal_g: float | None
    carbs_goal_g: float | None
    fat_goal_g: float | None
    summary_text: str
