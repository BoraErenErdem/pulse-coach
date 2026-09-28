"""Egzersiz kataloğu kaynak verisinin (data_sources/exercises, exercise_aliases,
exercise_catalog_renames) tutarlılık testleri - DB gerektirmez."""

import json
from collections import Counter
from pathlib import Path

from scripts.exercise_catalog_renames import RENAMES
from app.services.exercise_aliases import EXERCISE_ALIASES
from app.services.exercise_catalog_service import normalize_query
from app.services.fuzzy_match import tr_lower

DATA_DIR = Path(__file__).resolve().parent.parent / "data_sources" / "exercises"
CACHE = json.loads((DATA_DIR / "translated_cache.json").read_text(encoding="utf-8"))
RAW = json.loads((DATA_DIR / "exercises.json").read_text(encoding="utf-8"))
NAMES_TR = {entry["name_tr"] for entry in CACHE.values()}


def test_every_exercise_has_a_translation():
    assert sorted({ex["id"] for ex in RAW} - set(CACHE)) == []


def test_turkish_names_are_unique():
    """Aynı Türkçe ad iki kayıtta olunca (eski "Demir Haç", "Koşu Bandında Koşma",
    "Eğimli Şınav") eş-ad dizini biri lehine sessizce diğerini kaybeder ve
    kullanıcı hangi hareketi yaptığını ayırt edemez."""
    counts = Counter(tr_lower(name) for name in NAMES_TR)
    assert len(NAMES_TR) == len(CACHE)
    assert [name for name, n in counts.items() if n > 1] == []


def test_alias_targets_exist_in_catalog():
    """Hedef katalogda yoksa eş-ad sessizce atlanıp fuzzy'ye düşülür."""
    assert sorted(set(EXERCISE_ALIASES.values()) - NAMES_TR) == []


def test_alias_keys_survive_query_normalization():
    """Eş-ad aramadan önce sorgu normalize edilir ("dumbell" -> "dumbbell");
    normalize edilince değişen bir anahtar hiçbir zaman eşleşmez."""
    dead = [key for key in EXERCISE_ALIASES if " ".join(tr_lower(normalize_query(key)).split()) != key]
    assert dead == []


def test_renames_are_applied_to_translation_cache():
    for source_id, (old_name, new_name) in RENAMES.items():
        assert source_id in CACHE, source_id
        assert CACHE[source_id]["name_tr"] == new_name, source_id
        assert old_name != new_name, source_id


def test_normalize_query_rewrites_common_spellings():
    assert normalize_query("Dumbell Chest Press") == "dumbbell Chest Press"
    assert normalize_query("skull crushers") == "skullcrusher"
    assert normalize_query("triceps push down") == "triceps pushdown"
    assert normalize_query("3 drop set lateral raise") == "3 lateral raise"
    # "Drop Push" katalogda bir hareket - yalnız "drop set" atılır
    assert normalize_query("drop push") == "drop push"


def test_equipment_in_parentheses_is_kept():
    """2026-09-28 eval: "shoulder press (machine)" sade "Omuz Presi"ne gitti."""
    assert normalize_query("shoulder press (machine)") == "machine shoulder press"
    assert normalize_query("pushdown (rope)") == "rope pushdown"
    # ekipman olmayan açıklama eskisi gibi eşleştirmede atılır
    assert normalize_query("lat pulldown (geniş tutuş)") == "lat pulldown (geniş tutuş)"
