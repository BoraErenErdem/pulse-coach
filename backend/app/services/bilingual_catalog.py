from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80


class BilingualCatalog:
    """`food_catalog_service.py` ve `exercise_catalog_service.py`'nin ~70
    satırlık neredeyse birebir kopyasını (2026-08-10 mimari borç raporu,
    bulgu #5) tek bir yerde toplar. Her iki modelin de ortak varsayımı:
    hem `name_tr` hem `name_en` kolonu taşır, referans veri (katalog) sadece
    offline seed script'leriyle değişir — çalışan process boyunca mutasyona
    uğramaz.

    Cache anahtarı engine NESNESİ (`id()` değil) - `id()` kullanmak,
    testlerde çok sayıda engine hızlıca yaratılıp çöp toplanınca aynı
    id'nin başka bir engine'e yanlışlıkla eşleşmesi riski taşırdı; dict'in
    engine'e güçlü referansı bu riski ortadan kaldırıyor."""

    def __init__(self, model: type) -> None:
        self._model = model
        self._candidate_cache: dict[Engine, list[tuple]] = {}

    def _bilingual_candidates(self, catalog: list) -> list[tuple]:
        """Her satırı hem name_tr hem name_en ile birer aday olarak listeler,
        böylece kullanıcı/model hangi dilde yazarsa yazsın AYNI satır bulunur."""
        return [(row, row.name_tr) for row in catalog] + [(row, row.name_en) for row in catalog]

    def _cached_candidates(self, db: Session) -> list[tuple]:
        engine = db.get_bind()
        candidates = self._candidate_cache.get(engine)
        if candidates is None:
            rows = db.query(self._model).all()
            # KRİTİK: satırları cache'e koymadan önce session'dan ayır
            # (expunge). Canlı testte yakalandı (2026-08-05, hem food hem
            # exercise kataloğunda AYRI AYRI bulunmuştu - tam da bu kopya
            # kodun bakım riskine somut bir örnek): bu satırlar, onları ilk
            # kez sorgulayan request'in session'ına bağlı kalıyordu; o
            # session BAŞKA bir yazma işlemiyle commit olup kapanınca (ör.
            # aynı turda bir öğün/set kaydı) SQLAlchemy tüm izlediği
            # nesnelerin attribute'larını "expired" işaretliyor - sonraki
            # bir request cache'ten bu satırı çekip .id gibi bir alana
            # eriştiğinde session'ı artık kapalı olduğu için
            # sqlalchemy.orm.exc.DetachedInstanceError fırlatıyordu (agent
            # tool-call'ı çöküyor, kullanıcı "kaydettim ama..." yerine "sana
            # bağlanmakta sorun yaşıyorum" hatası görüyordu). expunge()
            # satırı ilgili session'ın izleme listesinden çıkarır - zaten
            # yüklenmiş olan tüm kolonlar (bu basit `.all()` sorgusu hepsini
            # getiriyor) sonsuza dek düz Python nesnesi gibi erişilebilir
            # kalır, HİÇBİR session'ın commit'inden etkilenmez.
            for row in rows:
                db.expunge(row)
            candidates = self._bilingual_candidates(rows)
            self._candidate_cache[engine] = candidates
        return candidates

    def invalidate_cache(self) -> None:
        """Katalog seed script'i process çalışırken veriyi değiştirirse (ör.
        bir sonraki çalıştırmada yeni satır eklenmesi) ya da testlerde manuel
        tazeleme gerekirse cache'i temizler."""
        self._candidate_cache.clear()

    def search(self, db: Session, query: str, limit: int = 5) -> list:
        candidates = self._cached_candidates(db)
        ranked = fuzzy_match.search(query, candidates, lambda pair: pair[1], limit=limit * 2)

        seen: set[int] = set()
        results: list = []
        for row, _name in ranked:
            if row.id not in seen:
                seen.add(row.id)
                results.append(row)
            if len(results) >= limit:
                break
        return results

    def best_match(self, db: Session, query: str) -> tuple:
        candidates = self._cached_candidates(db)
        pair, score = fuzzy_match.best_match(query, candidates, lambda p: p[1])
        if pair is None:
            return None, 0.0
        return pair[0], score

    def canonical_name(self, match, fallback: str, language: str = "tr") -> str:
        """Katalog eşleşmesi varsa kullanıcının dil tercihine göre (bkz.
        UserProfile.preferred_language) TR/EN kanonik ismi döner - eşleşme
        yoksa LLM'in/kullanıcının verdiği HAM ismi (fallback) olduğu gibi
        kullanır. Arama/eşleştirme mantığı dilden bağımsız kalır (bilingual
        candidate listesi HER ZAMAN iki dilde de aranır) - sadece SONUCUN
        hangi dilde GÖSTERİLECEĞİ/KAYDEDİLECEĞİ burada seçiliyor."""
        if match is None:
            return fallback
        return match.name_en if language == "en" else match.name_tr
