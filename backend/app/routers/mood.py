from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.agents import motivation_agent
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.exceptions import AppValidationError, validation_error_to_http
from app.models.user import User
from app.schemas.mood import MoodInsightRead, MoodLogCreate, MoodLogRead
from app.services import mood_service, profile_service, trend_service

router = APIRouter(prefix="/mood", tags=["mood"])

_MOOD_NOT_FOUND = {"tr": "Bugün için kaydedilmiş bir ruh hali bulunamadı.", "en": "No mood logged for today."}


@router.post("", response_model=MoodLogRead)
def set_mood(
    payload: MoodLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return mood_service.log_mood(db, current_user.id, payload.mood_key)
    except AppValidationError as exc:
        raise validation_error_to_http(exc, profile_service.get_language(db, current_user.id))


@router.get("/today", response_model=MoodLogRead | None)
def get_today_mood(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return mood_service.get_mood(db, current_user.id)


@router.delete("/today", status_code=status.HTTP_204_NO_CONTENT)
def delete_today_mood(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = mood_service.delete_mood(db, current_user.id)
    if not deleted:
        language = profile_service.get_language(db, current_user.id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_MOOD_NOT_FOUND[language])


@router.get("/history", response_model=list[MoodLogRead])
def get_mood_history(
    days: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return mood_service.list_mood_history(db, current_user.id, days=days)


@router.get("/insight", response_model=MoodInsightRead)
def get_mood_insight(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kural-tabanlı istatistik (haftalık eğilim ve/veya haftanın-günü
    örüntüsü) + LLM ile tek cümlelik, asla suçlayıcı olmayan bir gözlem -
    yeterli/anlamlı bir sinyal yoksa message None döner, frontend kartı hiç
    göstermez (bkz. trend_service.py::compute_mood_insight_stats,
    motivation_agent.py::render_mood_insight). /mood/history'den BİLEREK
    ayrı bir endpoint - LLM çağrısı birkaç saniye sürebiliyor, frontend ham
    geçmiş/grafiği anında gösterip içgörüyü ayrıca/gecikmeli yükleyebilir
    (exercise_insight ile AYNI gerekçe, bkz. routers/workouts.py)."""
    stats = trend_service.compute_mood_insight_stats(db, current_user.id)
    if stats is None:
        return MoodInsightRead(message=None)
    message = motivation_agent.render_mood_insight(db, current_user.id, stats)
    return MoodInsightRead(message=message)
