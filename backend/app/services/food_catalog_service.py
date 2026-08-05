from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80

# Katalog referans verisi - sadece offline seed script'leriyle değişir, çalışan
# process boyunca mutasyona uğramaz. Her arama çağrısında ~7.800 satırı yeniden
# çekip aday listesini yeniden kurmak yerine, engine başına (üretimde tek bir
# engine ömür boyu yaşar) bir kere kurulup bellekte tutulur. Anahtar engine
# NESNESİ (id() değil) - id() kullanmak, testlerde çok sayıda engine hızlıca
# yaratılıp çöp toplanınca aynı id'nin başka bir engine'e yanlışlıkla
# eşleşmesi riski taşırdı; dict'in engine'e güçlü referansı bu riski ortadan
# kaldırıyor.
_candidate_cache: dict[Engine, list[tuple[FoodCatalog, str]]] = {}


def _bilingual_candidates(catalog: list[FoodCatalog]) -> list[tuple[FoodCatalog, str]]:
    """Her satırı hem name_tr hem name_en ile birer aday olarak listeler,
    böylece model fotoğraf analizinde bazen İngilizce sızdırdığında (ör.
    "ızgara asparagus") de doğru kayıt bulunabilir — exercise_catalog_
    service.py'deki aynı deseni izliyor."""
    return [(row, row.name_tr) for row in catalog] + [(row, row.name_en) for row in catalog]


def _cached_candidates(db: Session) -> list[tuple[FoodCatalog, str]]:
    engine = db.get_bind()
    candidates = _candidate_cache.get(engine)
    if candidates is None:
        rows = db.query(FoodCatalog).all()
        # KRİTİK: satırları cache'e koymadan önce session'dan ayır (expunge).
        # Canlı testte yakalandı (2026-08-05): bu satırlar, onları ilk kez
        # sorgulayan request'in session'ına bağlı kalıyordu; o session
        # BAŞKA bir yazma işlemiyle commit olup kapanınca (ör. aynı turda
        # bir öğün kaydı) SQLAlchemy tüm izlediği nesnelerin attribute'larını
        # "expired" işaretliyor - sonraki bir request cache'ten bu satırı
        # çekip .id gibi bir alana eriştiğinde session'ı artık kapalı olduğu
        # için sqlalchemy.orm.exc.DetachedInstanceError fırlatıyordu (agent
        # tool-call'ı çöküyor, kullanıcı "kaydettim ama..." yerine "sana
        # bağlanmakta sorun yaşıyorum" hatası görüyordu). expunge() satırı
        # ilgili session'ın izleme listesinden çıkarır - zaten yüklenmiş
        # olan tüm kolonlar (bu basit `.all()` sorgusu hepsini getiriyor)
        # sonsuza dek düz Python nesnesi gibi erişilebilir kalır, HİÇBİR
        # session'ın commit'inden etkilenmez. bkz. exercise_catalog_service.py
        # (aynı düzeltme, aynı desen).
        for row in rows:
            db.expunge(row)
        candidates = _bilingual_candidates(rows)
        _candidate_cache[engine] = candidates
    return candidates


def invalidate_cache() -> None:
    """Katalog seed script'i process çalışırken veriyi değiştirirse (ör. bir
    sonraki çalıştırmada yeni satır eklenmesi) ya da testlerde manuel
    tazeleme gerekirse cache'i temizler."""
    _candidate_cache.clear()


def search_foods(db: Session, query: str, limit: int = 5) -> list[FoodCatalog]:
    """Besin kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~7.800 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz, ölçüldü). Hem Beslenme Takip Agent tool'u
    hem de GET /nutrition/foods/search endpoint'i bu fonksiyonu çağırır."""
    candidates = _cached_candidates(db)
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
    candidates = _cached_candidates(db)
    pair, score = fuzzy_match.best_match(query, candidates, lambda p: p[1])
    if pair is None:
        return None, 0.0
    return pair[0], score
