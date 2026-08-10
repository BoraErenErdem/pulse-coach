from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.nutrition import DailyNutritionSummaryRead, MealEntryCreate, MealEntryRead, MealEntryUpdate
from app.services import nutrition_log_service, profile_service

# Foto-analiz/geçmişi (nutrition_photos.py) ve katalog arama (catalog.py)
# ayrı router'lara taşındı (2026-08-10 mimari borç raporu, bulgu #6) - bu
# dosya artık sadece meal-entry CRUD + günlük özet. Endpoint yolları
# DEĞİŞMEDİ, main.py üç router'ı da ayrı ayrı mount ediyor.
router = APIRouter(prefix="/nutrition", tags=["nutrition"])

# Faz 3 sadece sohbet AI koçunu kapsamıştı - REST 404 mesajları hâlâ sabit
# Türkçe'ydi (2026-08-10 pürüz taraması, Tema C). chat_router._RATE_LIMIT_MESSAGES
# ile aynı desen.
_MEAL_NOT_FOUND = {"tr": "Öğün kaydı bulunamadı.", "en": "Meal entry not found."}


@router.post("/entries", response_model=MealEntryRead)
def log_entry(
    payload: MealEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    language = profile_service.get_language(db, current_user.id)
    try:
        return nutrition_log_service.log_meal(
            db,
            current_user.id,
            food_catalog_id=payload.food_catalog_id,
            quantity_grams=payload.quantity_grams,
            meal_type=payload.meal_type,
            log_date=payload.log_date,
            language=language,
        )
    except AppValidationError as exc:
        raise validation_error_to_http(exc, language)


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
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_MEAL_NOT_FOUND[language])


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
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))
    if entry is None:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_MEAL_NOT_FOUND[language])
    return entry


@router.get("/daily-summary", response_model=DailyNutritionSummaryRead)
def daily_summary(
    date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = nutrition_log_service.generate_daily_nutrition_summary(db, current_user.id, log_date=date)
    language = profile_service.get_language(db, current_user.id)
    return DailyNutritionSummaryRead(
        entry_count=result.entry_count,
        total_calories_kcal=result.total_calories_kcal,
        total_protein_g=result.total_protein_g,
        total_carbs_g=result.total_carbs_g,
        total_fat_g=result.total_fat_g,
        total_sugar_g=result.total_sugar_g,
        total_sodium_mg=result.total_sodium_mg,
        total_fiber_g=result.total_fiber_g,
        calorie_goal=result.calorie_goal,
        protein_goal_g=result.protein_goal_g,
        carbs_goal_g=result.carbs_goal_g,
        fat_goal_g=result.fat_goal_g,
        summary_text=result.as_text(language),
    )
