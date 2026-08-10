from sqlalchemy.orm import Session
from app.models.exercise_catalog import ExerciseCatalog
from app.services.bilingual_catalog import FUZZY_MATCH_THRESHOLD, BilingualCatalog

__all__ = ["FUZZY_MATCH_THRESHOLD", "invalidate_cache", "search_exercises", "best_match", "canonical_name"]

# bkz. food_catalog_service.py'deki aynı desen - ortak gövde artık
# bilingual_catalog.py'de (2026-08-10 mimari borç raporu, bulgu #5).
_catalog = BilingualCatalog(ExerciseCatalog)


def invalidate_cache() -> None:
    _catalog.invalidate_cache()


def search_exercises(db: Session, query: str, limit: int = 5) -> list[ExerciseCatalog]:
    """Egzersiz kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~870 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz). Hem Antrenman Takip Agent tool'u hem de
    GET /workouts/exercises/search endpoint'i bu fonksiyonu çağırır."""
    return _catalog.search(db, query, limit)


def best_match(db: Session, query: str) -> tuple[ExerciseCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_exercise_set` tool'unun
    otomatik eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    return _catalog.best_match(db, query)


def canonical_name(match: ExerciseCatalog | None, fallback: str, language: str = "tr") -> str:
    """Katalog eşleşmesi varsa kullanıcının dil tercihine göre (bkz.
    UserProfile.preferred_language) TR/EN kanonik ismi döner — eşleşme
    yoksa (katalogda net karşılık bulunamadıysa) LLM'in/kullanıcının verdiği
    HAM ismi (fallback) olduğu gibi kullanır."""
    return _catalog.canonical_name(match, fallback, language)
