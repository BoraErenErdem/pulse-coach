from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nutrition import (
    DailyNutritionSummaryRead,
    FoodCatalogRead,
    MealEntryCreate,
    MealEntryRead,
)
from app.services import food_catalog_service, nutrition_log_service

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.post("/entries", response_model=MealEntryRead)
def log_entry(
    payload: MealEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return nutrition_log_service.log_meal(
            db,
            current_user.id,
            food_catalog_id=payload.food_catalog_id,
            quantity_grams=payload.quantity_grams,
            meal_type=payload.meal_type,
            log_date=payload.log_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/entries", response_model=list[MealEntryRead])
def list_entries(
    days: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return nutrition_log_service.list_meal_entries(db, current_user.id, days=days)


@router.get("/daily-summary", response_model=DailyNutritionSummaryRead)
def daily_summary(
    date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = nutrition_log_service.generate_daily_nutrition_summary(db, current_user.id, log_date=date)
    return DailyNutritionSummaryRead(
        entry_count=result.entry_count,
        total_calories_kcal=result.total_calories_kcal,
        total_protein_g=result.total_protein_g,
        total_carbs_g=result.total_carbs_g,
        total_fat_g=result.total_fat_g,
        calorie_goal=result.calorie_goal,
        protein_goal_g=result.protein_goal_g,
        carbs_goal_g=result.carbs_goal_g,
        fat_goal_g=result.fat_goal_g,
        summary_text=result.as_text(),
    )


@router.get("/foods/search", response_model=list[FoodCatalogRead])
def search_foods(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return food_catalog_service.search_foods(db, q)
