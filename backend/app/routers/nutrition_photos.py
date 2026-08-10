from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session
from app.auth import rate_limit
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import validation_error_to_http
from app.models.user import User
from app.schemas.nutrition import MealPhotoRead, PhotoMealAnalysisRead, PhotoMealItemRead
from app.services import photo_history_service, photo_meal_service, profile_service

# nutrition.py'den ayrıldı (2026-08-10 mimari borç raporu, bulgu #6 - o
# dosya meal-entry CRUD + günlük özet + katalog arama + foto-analiz/geçmişi
# (tek başına 5 endpoint) olmak üzere 4 ayrı sorumluluk taşıyordu). Aynı
# `/nutrition` prefix'iyle mount edilir, endpoint yolları DEĞİŞMEDİ.
router = APIRouter(prefix="/nutrition", tags=["nutrition-photos"])

_PHOTO_NOT_FOUND = {"tr": "Fotoğraf bulunamadı.", "en": "Photo not found."}
_RATE_LIMIT_MESSAGES = {
    "tr": "Çok fazla fotoğraf analiz denemesi. {minutes} dakika sonra tekrar deneyin.",
    "en": "Too many photo analysis attempts. Please try again in {minutes} minutes.",
}


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
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))

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
