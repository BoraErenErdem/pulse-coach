from rapidfuzz import process
from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog

FUZZY_MATCH_THRESHOLD = 80


def search_foods(db: Session, query: str, limit: int = 5) -> list[FoodCatalog]:
    """Besin kataloğunda TR isim üzerinde fuzzy arama yapar (katalog
    ~1.500-2.000 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz). Hem Beslenme Takip Agent tool'u hem de
    GET /nutrition/foods/search endpoint'i bu fonksiyonu çağırır."""
    catalog = db.query(FoodCatalog).all()
    if not catalog:
        return []

    names = [row.name_tr for row in catalog]
    matches = process.extract(query, names, limit=limit)
    return [catalog[index] for _name, _score, index in matches]


def best_match(db: Session, query: str) -> tuple[FoodCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_meal` tool'unun otomatik
    eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    catalog = db.query(FoodCatalog).all()
    if not catalog:
        return None, 0.0

    names = [row.name_tr for row in catalog]
    match = process.extractOne(query, names)
    if match is None:
        return None, 0.0
    _name, score, index = match
    return catalog[index], score
