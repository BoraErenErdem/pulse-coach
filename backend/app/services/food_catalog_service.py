from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80


def _bilingual_candidates(catalog: list[FoodCatalog]) -> list[tuple[FoodCatalog, str]]:
    """Her satırı hem name_tr hem name_en ile birer aday olarak listeler,
    böylece model fotoğraf analizinde bazen İngilizce sızdırdığında (ör.
    "ızgara asparagus") de doğru kayıt bulunabilir — exercise_catalog_
    service.py'deki aynı deseni izliyor."""
    return [(row, row.name_tr) for row in catalog] + [(row, row.name_en) for row in catalog]


def search_foods(db: Session, query: str, limit: int = 5) -> list[FoodCatalog]:
    """Besin kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~7.800 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz, ölçüldü). Hem Beslenme Takip Agent tool'u
    hem de GET /nutrition/foods/search endpoint'i bu fonksiyonu çağırır."""
    catalog = db.query(FoodCatalog).all()
    candidates = _bilingual_candidates(catalog)
    ranked = fuzzy_match.search(query, candidates, lambda pair: pair[1], limit=limit * 2)

    seen: set[int] = set()
    results: list[FoodCatalog] = []
    for row, _name in ranked:
        if row.id not in seen:
            seen.add(row.id)
            results.append(row)
        if len(results) >= limit:
            break
    return results


def best_match(db: Session, query: str) -> tuple[FoodCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_meal` tool'unun otomatik
    eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    catalog = db.query(FoodCatalog).all()
    candidates = _bilingual_candidates(catalog)
    pair, score = fuzzy_match.best_match(query, candidates, lambda p: p[1])
    if pair is None:
        return None, 0.0
    return pair[0], score
