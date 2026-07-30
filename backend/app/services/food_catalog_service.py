from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80


def search_foods(db: Session, query: str, limit: int = 5) -> list[FoodCatalog]:
    """Besin kataloğunda TR isim üzerinde fuzzy arama yapar (katalog
    ~1.500-2.000 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz). Hem Beslenme Takip Agent tool'u hem de
    GET /nutrition/foods/search endpoint'i bu fonksiyonu çağırır."""
    catalog = db.query(FoodCatalog).all()
    return fuzzy_match.search(query, catalog, lambda row: row.name_tr, limit=limit)


def best_match(db: Session, query: str) -> tuple[FoodCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_meal` tool'unun otomatik
    eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    catalog = db.query(FoodCatalog).all()
    return fuzzy_match.best_match(query, catalog, lambda row: row.name_tr)
