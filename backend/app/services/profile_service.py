from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.user_profile import UserProfile

VALID_GOALS = {"weight_loss", "muscle_gain", "general_health"}
VALID_ACTIVITY_LEVELS = {"sedentary", "light", "moderate", "active"}
VALID_LANGUAGES = {"tr", "en"}


def get_profile(db: Session, user_id: int) -> UserProfile | None:
    """Kullanıcının profilini döndürür (yoksa None). Hem Profil Agent tool'u
    hem de GET /profile endpoint'i bu fonksiyonu çağırır."""
    return db.query(UserProfile).filter(UserProfile.user_id == user_id).first()


def get_language(db: Session, user_id: int) -> str:
    """Kullanıcının preferred_language'ını döndürür, profil yoksa "tr"
    varsayılanına düşer. Diğer router'lardaki (nutrition/workouts/progress)
    aynı inline deseni tekrarlamak yerine Faz 3 kapsamında orchestrator ve
    chat_router bu ortak helper'ı kullanıyor."""
    profile = get_profile(db, user_id)
    return profile.preferred_language if profile is not None else "tr"


def update_profile(
    db: Session,
    user_id: int,
    goal: str | None = None,
    activity_level: str | None = None,
    dietary_restrictions: str | None = None,
    target_weight_kg: float | None = None,
    daily_calorie_goal: float | None = None,
    daily_protein_goal_g: float | None = None,
    daily_carbs_goal_g: float | None = None,
    daily_fat_goal_g: float | None = None,
    preferred_language: str | None = None,
) -> UserProfile:
    """Profili günceller ya da yoksa oluşturur — sadece belirtilen alanlar
    değişir. Hem Profil Agent tool'u (serbest metni önce kendi normalize
    ederek buraya kanonik değer geçirir) hem de PUT /profile endpoint'i
    (formdan doğrudan kanonik değer gelir) bu fonksiyonu çağırır."""
    if goal is not None and goal not in VALID_GOALS:
        raise AppValidationError("invalid_goal", goal=goal)
    if activity_level is not None and activity_level not in VALID_ACTIVITY_LEVELS:
        raise AppValidationError("invalid_activity_level", activity_level=activity_level)
    if preferred_language is not None and preferred_language not in VALID_LANGUAGES:
        raise AppValidationError("invalid_language_preference", preferred_language=preferred_language)

    profile = get_profile(db, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.add(profile)

    if goal is not None:
        profile.goal = goal
    if activity_level is not None:
        profile.activity_level = activity_level
    if dietary_restrictions is not None:
        profile.dietary_restrictions = dietary_restrictions
    if target_weight_kg is not None:
        profile.target_weight_kg = target_weight_kg
    if daily_calorie_goal is not None:
        profile.daily_calorie_goal = daily_calorie_goal
    if daily_protein_goal_g is not None:
        profile.daily_protein_goal_g = daily_protein_goal_g
    if daily_carbs_goal_g is not None:
        profile.daily_carbs_goal_g = daily_carbs_goal_g
    if daily_fat_goal_g is not None:
        profile.daily_fat_goal_g = daily_fat_goal_g
    if preferred_language is not None:
        profile.preferred_language = preferred_language
    profile.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(profile)
    return profile
