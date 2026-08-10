from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session
from app.auth import rate_limit
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nutrition import (
    DailyNutritionSummaryRead,
    FoodCatalogRead,
    MealEntryCreate,
    MealEntryRead,
    MealEntryUpdate,
    MealPhotoRead,
    PhotoMealAnalysisRead,
    PhotoMealItemRead,
)
from app.services import food_catalog_service, nutrition_log_service, photo_history_service, photo_meal_service, profile_service

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

# Faz 3 sadece sohbet AI koçunu kapsamıştı - REST 404 mesajları hâlâ sabit
# Türkçe'ydi (2026-08-10 pürüz taraması, Tema C). chat_router._RATE_LIMIT_MESSAGES
# ile aynı desen.
_MEAL_NOT_FOUND = {"tr": "Öğün kaydı bulunamadı.", "en": "Meal entry not found."}
_PHOTO_NOT_FOUND = {"tr": "Fotoğraf bulunamadı.", "en": "Photo not found."}
_RATE_LIMIT_MESSAGES = {
    "tr": "Çok fazla fotoğraf analiz denemesi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many photo analysis attempts. Please try again in {minutes} minutes.",
}


@router.post("/entries", response_model=MealEntryRead)
def log_entry(
    payload: MealEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = profile_service.get_profile(db, current_user.id)
    language = profile.preferred_language if profile is not None else "tr"
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
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
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
    profile = profile_service.get_profile(db, current_user.id)
    language = profile.preferred_language if profile is not None else "tr"
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
    # /chat'teki AYNI gerekçe (chat_router.py) - her çağrı gerçek bir
    # vision-LLM isteği tetikliyor, önceden hiç sınırlanmamıştı (2026-08-10
    # pürüz taraması, Tema D).
    if rate_limit.is_locked_out(
        db, current_user.email, bucket="photo_analyze", max_attempts=rate_limit.PHOTO_ANALYZE_MAX_ATTEMPTS
    ):
        language = profile_service.get_language(db, current_user.id)
        detail = _RATE_LIMIT_MESSAGES[language].format(minutes=rate_limit.WINDOW_MINUTES)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
    rate_limit.record_failed_attempt(db, current_user.email, bucket="photo_analyze")

    image_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    try:
        items = photo_meal_service.analyze_meal_photo(db, image_bytes, mime_type=mime_type)
    except photo_meal_service.PhotoAnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))

    photo_history_service.save_meal_photo(
        db,
        current_user.id,
        image_bytes,
        mime_type=mime_type,
        detected_food_names=[item.food_name for item in items],
    )

    return PhotoMealAnalysisRead(
        items=[
            PhotoMealItemRead(
                food_name=item.food_name,
                estimated_grams=item.estimated_grams,
                matched_food=item.matched_food,
                candidates=item.candidates,
                is_uncertain=item.is_uncertain,
            )
            for item in items
        ]
    )


@router.get("/photo-history", response_model=list[MealPhotoRead])
def photo_history(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return photo_history_service.list_meal_photos(db, current_user.id, limit=limit)


@router.get("/photo-history/{photo_id}/image")
def photo_history_image(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    photo = photo_history_service.get_meal_photo(db, current_user.id, photo_id)
    if photo is None:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PHOTO_NOT_FOUND[language])
    return Response(content=photo.image_data, media_type=photo.mime_type)


@router.delete("/photo-history/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo_history_entry(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = photo_history_service.delete_meal_photo(db, current_user.id, photo_id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PHOTO_NOT_FOUND[language])
