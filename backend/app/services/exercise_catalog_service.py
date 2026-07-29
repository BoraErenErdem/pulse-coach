from rapidfuzz import process
from sqlalchemy.orm import Session
from app.models.exercise_catalog import ExerciseCatalog

FUZZY_MATCH_THRESHOLD = 80


def search_exercises(db: Session, query: str, limit: int = 5) -> list[ExerciseCatalog]:
    """Egzersiz kataloğunda TR isim üzerinde fuzzy arama yapar (katalog ~870
    satır olduğu için tamamını çekip Python'da skorlamak performans sorunu
    yaratmaz). Hem Antrenman Takip Agent tool'u hem de
    GET /workouts/exercises/search endpoint'i bu fonksiyonu çağırır."""
    catalog = db.query(ExerciseCatalog).all()
    if not catalog:
        return []

    names = [row.name_tr for row in catalog]
    matches = process.extract(query, names, limit=limit)
    return [catalog[index] for _name, _score, index in matches]


def best_match(db: Session, query: str) -> tuple[ExerciseCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_exercise_set` tool'unun
    otomatik eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    catalog = db.query(ExerciseCatalog).all()
    if not catalog:
        return None, 0.0

    names = [row.name_tr for row in catalog]
    match = process.extractOne(query, names)
    if match is None:
        return None, 0.0
    _name, score, index = match
    return catalog[index], score
