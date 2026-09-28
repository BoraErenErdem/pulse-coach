import re

from sqlalchemy.orm import Session
from app.models.exercise_catalog import ExerciseCatalog
from app.services.bilingual_catalog import FUZZY_MATCH_THRESHOLD, BilingualCatalog
from app.services.exercise_aliases import EXERCISE_ALIASES
from app.services.met_reference import FLEXIBILITY_CATEGORY

__all__ = [
    "FUZZY_MATCH_THRESHOLD",
    "invalidate_cache",
    "normalize_query",
    "search_exercises",
    "best_match",
    "match_for_set",
    "canonical_name",
]

# Sık yazım biçimleri kataloğun yazımına çekilir. 2026-09-28 canlı test: "dumbell
# chest press" ("dumbell" hiçbir kayıtta yok) "Kablo Göğüs Presi"ne, "skull
# crusher" (iki kelime; katalogda "Skullcrusher") "Bantlı Kafatası Ezici"ye gitti.
_QUERY_REWRITES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:dumbell|dumbel|dumbbel|dumbells|dumbels|dumbbels|dumbbells|dumbıl)\b", re.IGNORECASE), "dumbbell"),
    (re.compile(r"\bdambil\b", re.IGNORECASE), "dambıl"),
    (re.compile(r"\bskull[\s-]*crushers?\b", re.IGNORECASE), "skullcrusher"),
    (re.compile(r"\bpush[\s-]+down\b", re.IGNORECASE), "pushdown"),
    (re.compile(r"\bpull[\s-]+down\b", re.IGNORECASE), "pulldown"),
    # Set tekniği hareketin adı değil ("3 drop set lateral raise").
    (re.compile(r"\b(?:drop|süper|super|giant|dev)[\s-]*set(?:s|i|leri)?\b|\bdropset\w*|\bısınma seti\b", re.IGNORECASE), " "),
)


_PARENTHETICAL_RE = re.compile(r"\(([^)]*)\)")
_EQUIPMENT_WORD_RE = re.compile(
    r"\b(?:machine|makine\w*|cable|kablo\w*|dumbbell|dambıl|barbell|smith|ez|halat|rope|incline|eğimli|decline)\b",
    re.IGNORECASE,
)


def _lift_equipment_from_parentheses(query: str) -> str:
    """Parantez içi eşleştirmede atılır (serbest açıklama); ama ekipman/açı kelimesi
    hareketi belirler. 2026-09-28 eval: "shoulder press (machine)" -> sade "Omuz
    Presi" kaydedildi. Bu kelimeler parantezden çıkarılıp sorgunun başına alınır."""
    lifted: list[str] = []
    for content in _PARENTHETICAL_RE.findall(query):
        lifted.extend(match.group(0) for match in _EQUIPMENT_WORD_RE.finditer(content))
    if not lifted:
        return query
    return " ".join([*lifted, _PARENTHETICAL_RE.sub(" ", query)])


def normalize_query(query: str) -> str:
    query = _lift_equipment_from_parentheses(query)
    for pattern, replacement in _QUERY_REWRITES:
        query = pattern.sub(replacement, query)
    return " ".join(query.split())


# "1 kelime eksik" aşamasında eksik kalan kelime hareketin TÜRÜYSE aday elenir:
# "tek kol dambıl row" -> "Tek Kol Omuz Presi (Dambıl)" (eksik: row), "flat bench
# press" -> "Flat Bench Cable Flyes" (eksik: press) gidiyordu (2026-09-28 tarama).
_MOVEMENT_STEMS = (
    "pres", "row", "curl", "kıvır", "fly", "raise", "kaldır", "squat", "çömel", "deadlift",
    "lunge", "hamle", "extension", "uzat", "pushdown", "pulldown", "pullover", "shrug", "silk",
    "dip", "crunch", "mekik", "kickback", "thrust", "bridge", "köprü", "kürek", "çek", "itme",
    "açma", "açış", "şınav", "push", "pull", "barfiks", "plank", "swing", "sallama", "twist",
    "jump", "sıçra", "atla", "skullcrusher",
)
# Eksik kelime bir ekipmansa ve aday BAŞKA bir ekipman içeriyorsa aday elenir:
# "dumbbell chest press" -> "Cable Chest Press". Ekipmansız aday ("Goblet Squat")
# elenmez - kullanıcı ekipmanı ekstra belirtmiş olabilir.
_EQUIPMENT_GROUPS = (
    ("dumbbell", "dambıl", "db"),
    ("barbell", "halter"),
    ("ez",),
    ("cable", "kablo", "pulley", "makara"),
    ("smith",),
    ("machine", "makine", "leverage", "kaldıraç"),
    ("kettlebell",),
    ("band", "bant"),
    # Açı da aynı kuralla: "smith makinesi eğimli göğüs presi" (eksik: eğimli)
    # "Smith Makinesi Decline Göğüs Presi"ne gidiyordu (2026-09-28 eval).
    ("incline", "eğimli", "eğik"),
    ("decline",),
)


def _equipment_group(word: str) -> int | None:
    # Kısa kökler ("ez", "db") yalnız tam kelime: "Kafatası Ezici" EZ bar değil.
    for index, stems in enumerate(_EQUIPMENT_GROUPS):
        if any(word == stem or (len(stem) >= 4 and word.startswith(stem)) for stem in stems):
            return index
    return None


def _is_movement_word(word: str) -> bool:
    return word.startswith(_MOVEMENT_STEMS)


def _reject_one_word_short(query_words: list[str], missing_word: str, names_lower: str) -> bool:
    """names_lower: adayın TR ve EN adı birlikte (bkz. BilingualCatalog)."""
    name_words = re.findall(r"\w+", names_lower)
    # Tutan kelimelerin hepsi genel hareket kelimesiyse eşleşme ayırt edici değil:
    # "landmine press" -> "Press Sit-Up" (yalnız "press" ortak).
    if all(_is_movement_word(word) for word in query_words if word != missing_word):
        return True
    movement_stems = sorted((s for s in _MOVEMENT_STEMS if missing_word.startswith(s)), key=len, reverse=True)
    if movement_stems:
        # Kök adayda başka bir çekimle varsa ("press" -> "presi") hareket aynı.
        return not any(word.startswith(movement_stems[0]) for word in name_words)
    missing_group = _equipment_group(missing_word)
    if missing_group is None:
        return False
    return any((group := _equipment_group(word)) is not None and group != missing_group for word in name_words)


# bkz. food_catalog_service.py'deki aynı desen - ortak gövde artık
# bilingual_catalog.py'de (2026-08-10 mimari borç raporu, bulgu #5).
_catalog = BilingualCatalog(
    ExerciseCatalog,
    aliases=EXERCISE_ALIASES,
    normalize_query=normalize_query,
    reject_one_word_short=_reject_one_word_short,
    demote_variants=True,
)


def invalidate_cache() -> None:
    _catalog.invalidate_cache()


def search_exercises(db: Session, query: str, limit: int = 5) -> list[ExerciseCatalog]:
    """Egzersiz kataloğunda hem TR hem EN isim üzerinde fuzzy arama yapar
    (katalog ~870 satır olduğu için tamamını çekip Python'da skorlamak
    performans sorunu yaratmaz). Hem Antrenman Takip Agent tool'u hem de
    GET /workouts/exercises/search endpoint'i bu fonksiyonu çağırır."""
    return _catalog.search(db, query, limit)


def best_match(db: Session, query: str) -> tuple[ExerciseCatalog | None, float]:
    """En iyi eşleşmeyi ve skorunu döner. `log_exercise_set` tool'unun
    otomatik eşleştirme eşiğini (FUZZY_MATCH_THRESHOLD) uygulayabilmesi için."""
    return _catalog.best_match(db, query)


def match_for_set(db: Session, query: str, cardio_category: str | None) -> ExerciseCatalog | None:
    """Kayıt araçlarının kullandığı eşleşme: eşik altındaysa None. Hareketli
    kardiyo seti (koşu, yürüyüş, bisiklet...) SADECE katalogdaki 'kardiyo'
    kaydına bağlanır - canlı testte bulundu (2026-09-26): katalogda açık hava
    koşusu yok, "koşu" sorgusu "Koşucu Esnemesi"ne / pliometrik "Koşu Serbest
    Bırakmalı Göğüs İtme"ye bağlanıyordu. Uygun kardiyo kaydı yoksa set
    kullanıcının ifadesiyle (katalogsuz) kaydedilir. Esneklik setleri (plank
    vb. katalogda 'kuvvet') bu kuralın dışında."""
    match, score = best_match(db, query)
    if match is None or score < FUZZY_MATCH_THRESHOLD:
        return None
    if cardio_category and cardio_category != FLEXIBILITY_CATEGORY and match.category_tr != "kardiyo":
        return None
    return match


def canonical_name(match: ExerciseCatalog | None, fallback: str, language: str = "tr") -> str:
    """Katalog eşleşmesi varsa kullanıcının dil tercihine göre (bkz.
    UserProfile.preferred_language) TR/EN kanonik ismi döner — eşleşme
    yoksa (katalogda net karşılık bulunamadıysa) LLM'in/kullanıcının verdiği
    HAM ismi (fallback) olduğu gibi kullanır."""
    return _catalog.canonical_name(match, fallback, language)
