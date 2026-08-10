from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nutrition import FoodCatalogRead
from app.schemas.workout import ExerciseCatalogRead
from app.services import exercise_catalog_service, food_catalog_service

# nutrition.py/workouts.py'den ayrıldı (2026-08-10 mimari borç raporu, bulgu
# #6) - katalog arama, meal-entry/workout-session CRUD'undan ayrı bir
# sorumluluk, zaten servis katmanında da ayrı (food_catalog_service.py/
# exercise_catalog_service.py). Prefix'i tek bir router'a sığmadığı için
# (biri /nutrition, diğeri /workouts altında) her endpoint'in yolu açıkça
# yazılıyor, ENDPOINT YOLLARI DEĞİŞMEDİ.
router = APIRouter(tags=["catalog"])


@router.get("/nutrition/foods/search", response_model=list[FoodCatalogRead])
def search_foods(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return food_catalog_service.search_foods(db, q)


@router.get("/workouts/exercises/search", response_model=list[ExerciseCatalogRead])
def search_exercises(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exercise_catalog_service.search_exercises(db, q)
