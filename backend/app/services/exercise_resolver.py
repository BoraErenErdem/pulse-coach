"""Belirsiz egzersiz adlarını modelin adlandırmasıyla katalogda çözme (2026-09-29).

Sorun: kelime tabanlı eşleştirici (fuzzy_match) sık ifadelerde eş-adlar sayesinde
doğru, ama eş-adın olmadığı ifadelerde eşik üstü bir puanla YANLIŞ harekete
bağlıyordu ve bu sessizce kaydediliyordu - "baldır makinesi" -> "Baldır Makinesi
Omuz Silkme", "halatla triceps" -> "Triceps Germe", "dambıl rdl" -> "Dambıl
Clean" (eval/exercise_match_benchmark.py: 40 zor ifadenin 17'si yanlış).

Çözüm, iki adım:
1. Model yalnızca ADLANDIRIR: ifadenin standart İngilizce hareket adı ("halatla
   triceps" -> "Triceps Rope Pushdown"). Aday listesi GÖSTERİLMEZ - gösterilince
   model benzer ama farklı bir adayı seçiyor, adı bile adaya uyduruyordu
   ("pendulum squat" -> "Squat"). Bir mesajdaki tüm belirsiz adlar tek çağrıda.
2. Katalog eşleştirmesini KOD yapar: İngilizce ad kelime + anlam (gömme)
   aramasıyla aday toplar; adın bütün kelimelerini içeren adaylardan en az fazla
   kelimelisi seçilir. Tutan aday yoksa katalogsuz (kullanıcının adıyla) kaydedilir
   - yanlış bir harekete bağlamaktan iyidir.

Kesin eşleşmede (eş-ad ya da ad birebir aynı) ve sorgunun bütün kelimelerini bulan
kelime eşleşmesinde (bkz. TRUSTED_LEXICAL_SCORE) model hiç çağrılmaz. Model
erişilemezse ya da yanıtı okunamazsa eski davranışa (eşik üstü en iyi eşleşme)
dönülür.
"""

import json
import logging
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.exercise_catalog import ExerciseCatalog
from app.services import exercise_catalog_service
from app.services.catalog_vectors import CatalogVectors
from app.services.met_reference import FLEXIBILITY_CATEGORY

logger = logging.getLogger(__name__)

# Kelime tabanlı eşleşme bu puandaysa (sorgunun bütün kelimeleri adda, fuzzy_match
# "tüm kelimeler" katmanı) olduğu gibi kullanılır; model önek devamı (100 ama kesin
# değil: "baldır makinesi" -> "Baldır Makinesi Omuz Silkme"), "bir kelime eksik" (88)
# ve eşik altı sonuçlarda devreye girer. 2026-09-29 ölçümü (eval/exercise_match_
# benchmark.py), eski puan katmanına göre eski doğruluk: kesin 40/40, 95 -> %78,
# 100 önek -> %71, 88 -> %39. Model 88'de yanlışları 33'ten 5'e, önekte 4'ten 1'e
# indirdi; 95'te ise son kontrol setinde (katalog diline yakın ifadeler) eskisinden
# kötüydü (14/14 -> 9 doğru): adlandırırken niteleyici düşürüyor ("dar tutuş ez bar
# curl" -> "EZ Bar Curl").
TRUSTED_LEXICAL_SCORE = 95.0
LEXICAL_CANDIDATES = 8
SEMANTIC_CANDIDATES = 8

# ifadeler -> her ifadenin standart İngilizce hareket adı (bilinmiyorsa None); model yanıtı yoksa None.
Namer = Callable[[list[str]], list[str | None] | None]


@dataclass
class _Pending:
    name: str
    cardio_category: str | None
    fallback: ExerciseCatalog | None


_vectors: CatalogVectors | None = None


def _catalog_vectors() -> CatalogVectors:
    global _vectors
    if _vectors is None:
        _vectors = CatalogVectors("exercise", get_settings().catalog_vectors_dir)
    return _vectors


def _cardio_allowed(row: ExerciseCatalog, cardio_category: str | None) -> bool:
    """match_for_set ile aynı kural: hareketli kardiyo seti yalnız 'kardiyo' kaydına."""
    return not (cardio_category and cardio_category != FLEXIBILITY_CATEGORY and row.category_tr != "kardiyo")


NAMING_PROMPT = """Bir fitness uygulamasında kullanıcının yazdığı egzersiz ifadelerini standart İngilizce hareket adına çeviriyorsun.
İfadeler Türkçe, İngilizce ya da karışık olabilir; salon argosu ve yazım hataları içerebilir.
Her ifade için yaygın kullanılan İngilizce hareket adını yaz (ör. "halatla triceps" -> "Triceps Rope Pushdown",
"yan omuz kablo" -> "Cable Lateral Raise", "dambıl rdl" -> "Dumbbell Romanian Deadlift", "yan mekik" -> "Oblique
Crunch"). İfadedeki ekipmanı ve niteleyicileri (yan, ters, tek kol, oturarak, eğimli, dar/geniş tutuş...) adda koru,
ifadede olmayan ekipman ya da niteleyici EKLEME. İfade bir egzersiz değilse ya da ne olduğunu bilmiyorsan null yaz.
Yalnızca JSON yaz: ifade numarası -> ad, ör. {{"1": "Seated Calf Raise", "2": null}}.

{items}"""


def build_naming_prompt(names: list[str]) -> str:
    return NAMING_PROMPT.format(items="\n".join(f'{i}) "{name}"' for i, name in enumerate(names, start=1)))


def parse_names(text: str, count: int) -> list[str | None] | None:
    """Modelin JSON yanıtı -> her ifade için İngilizce ad (ya da None); biçim bozuksa None."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match is None:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    result: list[str | None] = []
    for index in range(1, count + 1):
        if str(index) not in data:
            return None
        value = data[str(index)]
        if isinstance(value, dict):  # {"hareket": "..."} biçimi de kabul
            value = next((v for v in value.values() if isinstance(v, str)), None)
        result.append(value.strip() if isinstance(value, str) and value.strip() else None)
    return result


def llm_namer(names: list[str]) -> list[str | None] | None:
    from app.agents.llm import get_choice_llm

    try:
        reply = get_choice_llm().invoke(build_naming_prompt(names))
    except Exception:
        logger.exception("Egzersiz adlandırma başarısız (model)")
        return None
    parsed = parse_names(reply.text, len(names))
    if parsed is None:
        logger.warning("Egzersiz adlandırma yanıtı okunamadı: %r", reply.text[:200])
    return parsed


_JOINED_UP_RE = re.compile(r"\b(push|pull|chin|sit|step|v)[\s-]+ups?\b")
_STOP_WORDS = {"the", "a", "an", "with", "on", "to", "and", "of", "in", "exercise", "exercises"}
# Katalogun (ExerciseDB) kelimeleri modelin günlük salon diline çekilir.
_TOKEN_SYNONYMS = {
    "leverage": "machine",
    "lever": "machine",
    "pulley": "cable",
    "db": "dumbbell",
    "bb": "barbell",
    "one": "single",
    "abdominal": "ab",
    "hyper": "hyperextension",
    "prone": "lying",
    "rear": "reverse",
    "alternating": "alternate",
}
# Kullanıcının söylemediği FARKLI bir ekipman taşıyan kayıt aynı hareket değildir:
# "Calf Machine Raise" -> "Smith Machine Calf Raise" (2026-09-29 ölçümü).
_EQUIPMENT_TOKENS = {"smith", "barbell", "dumbbell", "cable", "band", "chain", "kettlebell", "plate", "sled", "ez"}


def _movement_tokens(text: str) -> set[str]:
    """İngilizce hareket adının karşılaştırma kelimeleri: küçük harf, "push-up" ->
    "pushup", çoğul/"flye" eki atılmış, dolgu kelimeleri çıkarılmış."""
    text = _JOINED_UP_RE.sub(lambda m: m.group(1) + "up", text.lower())
    tokens = set()
    for word in re.findall(r"[a-z0-9]+", text):
        if word in _STOP_WORDS:
            continue
        if word in ("flyes", "flies", "flye"):
            word = "fly"
        elif word.endswith(("ches", "shes", "xes")):
            word = word[:-2]
        elif word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
            word = word[:-1]
        tokens.add(_TOKEN_SYNONYMS.get(word, word))
    return tokens


# Anlamı değiştiren niteleyiciler: kullanıcı söylemediyse bunları taşıyan kayıt başka
# bir harekettir ("Hyperextension" -> "Reverse Hyperextension", "Smith Machine Row" ->
# "Smith Machine Upright Row", "Kettlebell Deadlift" -> "Kettlebell One-Legged Deadlift").
_VARIANT_TOKENS = {
    "reverse", "upright", "single", "legged", "kneeling", "band", "chain", "jump", "twist", "behind",
    "neck", "alternating", "alternate", "decline", "incline", "close", "wide", "pause", "deficit",
    "snatch", "hang", "isometric", "ball", "bosu", "stability", "sled", "plate", "throw", "stretch",
    "hammer", "no", "without",
}
# Tek başına ayırt edici olmayan hareket kelimeleri ("Row Machine" -> herhangi bir "row" değil).
_GENERIC_MOVEMENT_TOKENS = {
    "row", "press", "curl", "raise", "fly", "squat", "extension", "pulldown", "pushdown", "crunch",
    "deadlift", "lunge", "pullup", "pushup", "dip", "shrug", "kickback", "bridge", "thrust", "hold",
    "walk", "run", "machine",
}


def movement_rank(movement: str, row: ExerciseCatalog) -> tuple[int, int] | None:
    """Kayıt `movement` ile tutarlıysa (katman, fazladan kelime sayısı), değilse None.
    Katman 0: hareketin bütün kelimeleri kaydın İngilizce adında. Katman 1: "machine"
    dışındaki kelimelerin hepsi (katalogdaki makine hareketlerinin çoğunun adında
    "machine" yok: "Seated Calf Raise", "Thigh Adductor"). Katman 2: kayıt en az iki
    kelimelik daha genel sürüm ("Dumbbell Romanian Deadlift" -> "Romanian Deadlift").
    Tek kelimelik genel kayıt ("Pendulum Squat" -> "Squat"), kullanıcının söylemediği
    ekipman ya da anlam değiştiren niteleyici taşıyan kayıt tutarsızdır."""
    wanted = _movement_tokens(movement)
    have = _movement_tokens(row.name_en)
    if not wanted or not have:
        return None
    # Esneme kaydı yalnız esneme istendiyse ("iç bacak" -> "Adductor" esnemesi değil makine).
    if row.category_tr == "esneklik" and not wanted & {"stretch", "yoga", "mobility"}:
        return None
    extra = have - wanted
    if extra & _VARIANT_TOKENS:
        return None
    # Ekipman çakışması yalnız kullanıcı bir ekipman söylediyse: "Reverse Curl" ->
    # "Reverse Cable Curl" kabul, "Calf Machine Raise" -> "Smith Machine Calf Raise" değil.
    if wanted & (_EQUIPMENT_TOKENS | {"machine"}) and extra & _EQUIPMENT_TOKENS:
        return None
    if wanted <= have:
        return 0, len(extra)
    required = wanted - {"machine"}
    if required and required <= have and (len(required) >= 2 or not required <= _GENERIC_MOVEMENT_TOKENS):
        return 1, len(have - required)
    if len(have) >= 2 and have <= wanted:
        return 2, len(wanted - have)
    return None


class ExerciseResolver:
    """Bir sohbet turu boyunca egzersiz adı -> katalog satırı çözümü (tur içinde önbellekli)."""

    def __init__(
        self,
        db: Session,
        namer: Namer | None = None,
        vectors: CatalogVectors | None = None,
        enabled: bool | None = None,
    ) -> None:
        self._db = db
        self._enabled = get_settings().exercise_llm_resolve if enabled is None else enabled
        self._namer = namer or llm_namer
        self._vectors = vectors
        self._resolved: dict[tuple[str, str | None], ExerciseCatalog | None] = {}

    def _deterministic(self, name: str, cardio_category: str | None) -> tuple[ExerciseCatalog | None, bool, float]:
        """(eşik üstü en iyi eşleşme, kesin mi, puan)."""
        match, score = exercise_catalog_service.best_match(self._db, name)
        if match is None or score < exercise_catalog_service.FUZZY_MATCH_THRESHOLD or not _cardio_allowed(match, cardio_category):
            return None, False, score
        return match, exercise_catalog_service.is_certain_match(self._db, name, match), score

    def _by_movement(
        self, raw: str, movement: str, cardio_category: str | None, fallback: ExerciseCatalog | None
    ) -> ExerciseCatalog | None:
        """Modelin verdiği İngilizce adla katalog kaydı: kelime tabanlı eşleşme
        (`fallback`, kullanıcının kendi kelimeleriyle) adın bütün kelimelerini
        içeriyorsa o; adın kesin eşleşmesi varsa o; yoksa adla tutarlı adaylardan en iyi sıralanan (bkz.
        movement_rank; eşitlikte aday sırası). 2026-09-29 ölçümü: model adlandırırken
        niteleyiciyi düşürebiliyor ("çapraz hammer curl" -> "Hammer Curl", "zottman
        preacher" -> "Zottman Curl"); kelime tabanlı eşleşme bunları koruyor, modelin
        adı da onun doğru hareket olduğunu teyit ediyor."""
        fallback_rank = movement_rank(movement, fallback) if fallback is not None else None
        if fallback is not None and fallback_rank is not None and fallback_rank[0] <= 1:
            return fallback
        match, certain, _score = self._deterministic(movement, cardio_category)
        if certain:
            return match
        rows = exercise_catalog_service.all_rows(self._db)
        by_id = {row.id: row for row in rows}
        pool: list[ExerciseCatalog] = []
        seen: set[int] = set()

        def add(row: ExerciseCatalog | None) -> None:
            if row is not None and row.id not in seen and _cardio_allowed(row, cardio_category):
                seen.add(row.id)
                pool.append(row)

        add(match)
        for query in (movement, raw):
            for row in exercise_catalog_service.search_exercises(self._db, query, limit=LEXICAL_CANDIDATES):
                add(row)
        vectors = self._vectors or _catalog_vectors()
        for row_id in vectors.nearest(rows, movement, SEMANTIC_CANDIDATES):
            add(by_id.get(row_id))
        scored = [(rank, order, row) for order, row in enumerate(pool) if (rank := movement_rank(movement, row)) is not None]
        return min(scored, key=lambda item: item[:2])[2] if scored else None

    def prefetch(self, items: Sequence[tuple[str, str | None]]) -> None:
        """Adları toplu çözer: kesin olmayanlar TEK model çağrısında adlandırılır."""
        pending: list[_Pending] = []
        for name, cardio_category in dict.fromkeys(items):
            key = (name, cardio_category)
            if key in self._resolved or not name.strip():
                continue
            match, certain, score = self._deterministic(name, cardio_category)
            if certain or score == TRUSTED_LEXICAL_SCORE or not self._enabled:
                self._resolved[key] = match
                continue
            pending.append(_Pending(name, cardio_category, match))
        if not pending:
            return
        movements = self._namer([p.name for p in pending])
        for index, item in enumerate(pending):
            key = (item.name, item.cardio_category)
            if movements is None:
                self._resolved[key] = item.fallback
                continue
            movement = movements[index]
            chosen = self._by_movement(item.name, movement, item.cardio_category, item.fallback) if movement else None
            if chosen is not item.fallback:
                logger.info(
                    "Egzersiz eşleşmesi değişti: %r (%s) %s -> %s",
                    item.name,
                    movement,
                    item.fallback.name_tr if item.fallback else None,
                    chosen.name_tr if chosen else None,
                )
            self._resolved[key] = chosen

    def match(self, name: str, cardio_category: str | None) -> ExerciseCatalog | None:
        key = (name, cardio_category)
        if key not in self._resolved:
            self.prefetch([key])
        return self._resolved[key]
