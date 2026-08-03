from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from app.models.exercise_catalog import ExerciseCatalog
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80

# bkz. food_catalog_service.py'deki aynı cache deseni - katalog referans
# verisi process boyunca mutasyona uğramaz, engine başına bir kere kurulup
# bellekte tutulur (anahtar engine NESNESİ, id() değil - id-reuse riski).
_candidate_cache: dict[Engine, list[tuple[ExerciseCatalog, str]]] = {}


def _bilingual_candidates(catalog: list[ExerciseCatalog]) -> list[tuple[ExerciseCatalog, str]]:
    """Her satırı hem name_tr hem name_en ile birer aday olarak listeler,
    böylece kullanıcı hangi dilde yazarsa yazsın (İngilizce ya da Türkçe
    isim) AYNI satır bulunur. fuzzy_match.py'nin tek-isimli genel API'sini
    değiştirmeden, eşleştirmeyi bu (satır, isim) çiftleri üzerinde
    çalıştırıp sonra satıra göre dedupe ediyoruz."""
    return [(row, row.name_tr) for row in catalog] + [(row, row.name_en) for row in catalog]


def _cached_candidates(db: Session) -> list[tuple[ExerciseCatalog, str]]:
    engine = db.get_bind()
    candidates = _candidate_cache.get(engine)
    if candidates is None:
        candidates = _bilingual_candidates(db.query(ExerciseCatalog).all())
        _candidate_cache[engine] = candidates
    return candidates


def invalidate_cache() -> None:
    """Katalog seed script'i process çalışırken veriyi değiştirirse ya da
    testlerde manuel tazeleme gerekirse cache'i temizler."""
    _candidate_cache.clear()


def search_exercises(db: Session, query: str, limit: int = 5) -> list[ExerciseCatalog]:
    """Egzersiz kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~870 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz). Hem Antrenman Takip Agent tool'u hem de
    GET /workouts/exercises/search endpoint'i bu fonksiyonu çağırır."""
    candidates = _cached_candidates(db)
    ranked = fuzzy_match.search(query, candidates, lambda pair: pair[1], limit=limit * 2)

    seen: set[int] = set()
    results: list[ExerciseCatalog] = []
    for row, _name in ranked:
        if row.id not in seen:
            seen.add(row.id)
            results.append(row)
        if len(results) >= limit:
            break
    return results


def best_match(db: Session, query: str) -> tuple[ExerciseCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_exercise_set` tool'unun
    otomatik eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    candidates = _cached_candidates(db)
    pair, score = fuzzy_match.best_match(query, candidates, lambda p: p[1])
    if pair is None:
        return None, 0.0
    return pair[0], score
