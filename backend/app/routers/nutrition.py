from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nutrition import (
    DailyNutritionSummaryRead,
    FoodCatalogRead,
    MealEntryCreate,
    MealEntryRead,
    MealEntryUpdate,
    PhotoMealAnalysisRead,
    PhotoMealItemRead,
)
from app.services import food_catalog_service, nutrition_log_service, photo_meal_service

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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.get("/entries", response_model=list[MealEntryRead])
def list_entries(
    days: int | None = None,
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return nutrition_log_service.list_meal_entries(db, current_user.id, days=days, limit=limit)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = nutrition_log_service.delete_meal_entry(db, current_user.id, entry_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Öğün kaydı bulunamadı.")


@router.patch("/entries/{entry_id}", response_model=MealEntryRead)
def update_entry(
    entry_id: int,
    payload: MealEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        entry = nutrition_log_service.update_meal_entry(
            db,
            current_user.id,
            entry_id,
            quantity_grams=payload.quantity_grams,
            meal_type=payload.meal_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Öğün kaydı bulunamadı.")
    return entry


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
        total_sugar_g=result.total_sugar_g,
        total_sodium_mg=result.total_sodium_mg,
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


@router.post("/photo-analyze", response_model=PhotoMealAnalysisRead)
async def analyze_photo(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image_bytes = await file.read()
    try:
        items = photo_meal_service.analyze_meal_photo(
            db, image_bytes, mime_type=file.content_type or "application/octet-stream"
        )
    except photo_meal_service.PhotoAnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))

    return PhotoMealAnalysisRead(
        items=[
            PhotoMealItemRead(
                food_name=item.food_name,
                estimated_grams=item.estimated_grams,
                matched_food=item.matched_food,
                candidates=item.candidates,
            )
            for item in items
        ]
    )
