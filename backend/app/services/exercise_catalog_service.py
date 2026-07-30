from sqlalchemy.orm import Session
from app.models.exercise_catalog import ExerciseCatalog
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80


def search_exercises(db: Session, query: str, limit: int = 5) -> list[ExerciseCatalog]:
    """Egzersiz kataloğunda TR isim üzerinde fuzzy arama yapar (katalog ~870
    satır olduğu için tamamını çekip Python'da skorlamak performans sorunu
    yaratmaz). Hem Antrenman Takip Agent tool'u hem de
    GET /workouts/exercises/search endpoint'i bu fonksiyonu çağırır."""
    catalog = db.query(ExerciseCatalog).all()
    return fuzzy_match.search(query, catalog, lambda row: row.name_tr, limit=limit)


def best_match(db: Session, query: str) -> tuple[ExerciseCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_exercise_set` tool'unun
    otomatik eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    catalog = db.query(ExerciseCatalog).all()
    return fuzzy_match.best_match(query, catalog, lambda row: row.name_tr)
