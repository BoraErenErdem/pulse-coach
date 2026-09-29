import re
from collections.abc import Callable
from typing import Any

from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session
from app.services import fuzzy_match

FUZZY_MATCH_THRESHOLD = 80
_PAREN_CONTENT_RE = re.compile(r"\(([^)]*)\)")


def _fold_i(text: str) -> str:
    return text.replace("ı", "i")


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

    def __init__(
        self,
        model: type,
        aliases: dict[str, str] | None = None,
        *,
        normalize_query: Callable[[str], str] | None = None,
        reject_one_word_short: Callable[[list[str], str, str], bool] | None = None,
        demote_variants: bool = False,
    ) -> None:
        self._model = model
        # Egzersiz kataloğuna özgü ayarlar (bkz. exercise_catalog_service);
        # besin kataloğu hiçbirini vermez, davranışı değişmez.
        self._normalize_query = normalize_query or (lambda query: query)
        self._demote_variants = demote_variants
        # Aday (satır, tek dildeki ad) çiftidir; kural satırın İKİ dildeki adını
        # birlikte görür: "geniş tutuş lat pulldown" doğru adayı Türkçe adıyla
        # ("... Aşağı Çekme") tartarken "pulldown" İngilizce adda geçiyor.
        self._reject_one_word_short: fuzzy_match.OneWordShortRejector | None = None
        if reject_one_word_short is not None:
            rule = reject_one_word_short

            def _reject(query_words: list[str], missing_word: str, pair: tuple) -> bool:
                row = pair[0]
                return rule(query_words, missing_word, fuzzy_match.tr_lower(f"{row.name_tr} {row.name_en}"))

            self._reject_one_word_short = _reject
        self._candidate_cache: dict[Engine | Connection, list[tuple]] = {}
        # Sorgu -> name_tr sabit eşlemesi (bkz. food_aliases.py); fuzzy
        # eşleştirmeden ÖNCE bakılır, hedef satır yoksa atlanır.
        # i/ı katlanmış anahtarla: tr_lower İngilizce "Incline"ı "ıncline" yapar,
        # model büyük harfle yazınca "incline bench press" eş-adı kaçıyordu.
        self._folded_aliases = {_fold_i(key): target for key, target in (aliases or {}).items()}
        self._rows_by_name_tr: dict[object, dict[str, Any]] = {}

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
        self._rows_by_name_tr.clear()

    def _alias_row(self, db: Session, query: str) -> Any:
        # Parantez içi, fuzzy eşleştirmedeki gibi atılır: model "kaşarlı tost
        # (pişmiş)" gibi açıklama ekleyebiliyor (eval 2026-09-27).
        key = fuzzy_match.tr_lower(fuzzy_match._strip_parenthetical(query))
        target = self._folded_aliases.get(_fold_i(" ".join(key.split())))
        if target is None:
            return None
        engine = db.get_bind()
        index = self._rows_by_name_tr.get(engine)
        if index is None:
            index = {row.name_tr: row for row, _name in self._cached_candidates(db)}
            self._rows_by_name_tr[engine] = index
        return index.get(target)

    def rows(self, db: Session) -> list:
        """Katalogdaki tüm satırlar (önbellekten, session'dan ayrılmış)."""
        return list(dict.fromkeys(row for row, _name in self._cached_candidates(db)))

    def is_certain(self, db: Session, query: str, match: Any) -> bool:
        """Eşleşme kesin mi: sorgu bir eş-ad ya da kaydın TR/EN adıyla (ya da adın
        parantez içiyle, ör. "Squat (Çömelme)") tire/boşluk/tekil-çoğul farkı dışında aynı."""
        query = self._normalize_query(query)
        if self._alias_row(db, query) is match:
            return True
        target = fuzzy_match._compact(fuzzy_match.tr_lower(fuzzy_match._strip_parenthetical(query)))
        if not target:
            return False
        names: list[str] = []
        for name in (match.name_tr, match.name_en):
            names.append(fuzzy_match._strip_parenthetical(name))
            names.extend(_PAREN_CONTENT_RE.findall(name))
        for name in names:
            compact = fuzzy_match._compact(fuzzy_match.tr_lower(name))
            if compact and (target in (compact, compact + "s") or compact + "s" == target):
                return True
        return False

    def search(self, db: Session, query: str, limit: int = 5) -> list:
        raw_query, query = query, self._normalize_query(query)
        candidates = self._cached_candidates(db)
        ranked = fuzzy_match.search(
            query,
            candidates,
            lambda pair: pair[1],
            limit=limit * 2,
            reject_one_word_short=self._reject_one_word_short,
            fuzzy_fill=query == raw_query,
        )
        if query != raw_query:
            # Arama listesi (kullanıcı seçer): normalize edilmiş sorgu "skull crusher"ı
            # "skullcrusher" yapınca bantlı/decline varyantlar listeden düşüyordu -
            # ham sorgunun eşleşmeleri de arkaya eklenir.
            ranked += fuzzy_match.search(
                raw_query,
                candidates,
                lambda pair: pair[1],
                limit=limit * 2,
                reject_one_word_short=self._reject_one_word_short,
            )
        alias_row = self._alias_row(db, query)
        if alias_row is not None:
            ranked = [(alias_row, alias_row.name_tr), *ranked]

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
        query = self._normalize_query(query)
        alias_row = self._alias_row(db, query)
        if alias_row is not None:
            return alias_row, 100.0
        candidates = self._cached_candidates(db)
        pair, score = fuzzy_match.best_match(
            query,
            candidates,
            lambda p: p[1],
            reject_one_word_short=self._reject_one_word_short,
            demote_variants=self._demote_variants,
        )
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
