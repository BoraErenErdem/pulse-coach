from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog
from app.services.bilingual_catalog import FUZZY_MATCH_THRESHOLD, BilingualCatalog

__all__ = ["FUZZY_MATCH_THRESHOLD", "invalidate_cache", "search_foods", "best_match", "canonical_name"]

# Arama/eşleştirme/cache mantığının ortak gövdesi artık bilingual_catalog.py'de
# (2026-08-10 mimari borç raporu, bulgu #5 - exercise_catalog_service.py'yle
# ~70 satır neredeyse birebir kopyaydı). Bu modül geriye dönük uyumluluk için
# AYNI fonksiyon isimleriyle ince bir sarmalayıcı - çağıran taraflar
# (router'lar/agent'lar/testler) hiçbir değişiklik gerektirmiyor.
_catalog = BilingualCatalog(FoodCatalog)


def invalidate_cache() -> None:
    _catalog.invalidate_cache()


def search_foods(db: Session, query: str, limit: int = 5) -> list[FoodCatalog]:
    """Besin kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~7.800 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz, ölçüldü). Hem Beslenme Takip Agent tool'u
    hem de GET /nutrition/foods/search endpoint'i bu fonksiyonu çağırır."""
    return _catalog.search(db, query, limit)


def best_match(db: Session, query: str) -> tuple[FoodCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_meal` tool'unun otomatik
    eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    return _catalog.best_match(db, query)


def canonical_name(match: FoodCatalog | None, fallback: str, language: str = "tr") -> str:
    return _catalog.canonical_name(match, fallback, language)
