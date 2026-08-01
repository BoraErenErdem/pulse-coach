"""USDA ham JSON'larından (SR Legacy + Foundation Foods + Survey FNDDS)
Türk mutfağına/günlük kullanıma uygun, küratörlü bir besin alt kümesi çıkarır.

Ham veri dosyaları `data_sources/usda/` altında bulunmalı (download-datasets
sayfasından elle indirilip unzip edilir, repoya commit edilmez — .gitignore'da):
  - FoodData_Central_sr_legacy_food_json_2018-04.json
  - FoodData_Central_foundation_food_json_2026-04-30.json
  - surveyDownload.json (Survey/FNDDS)

Kullanım: python -m scripts.curate_food_subset
Çıktı: data_sources/usda/curated_subset.json
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data_sources" / "usda"
SR_LEGACY_PATH = DATA_DIR / "FoodData_Central_sr_legacy_food_json_2018-04.json"
FOUNDATION_PATH = DATA_DIR / "FoodData_Central_foundation_food_json_2026-04-30.json"
SURVEY_PATH = DATA_DIR / "surveyDownload.json"
OUTPUT_PATH = DATA_DIR / "curated_subset.json"

# SR Legacy + Foundation için: kullanıcıya pratikte hitap etmeyen kategoriler
# (ABD'ye özgü fast-food/restoran zinciri isimleri, bebek maması, çok
# spesifik yerel mutfak vb.)
EXCLUDED_CATEGORIES = {
    "Fast Foods",
    "Restaurant Foods",
    "Baby Foods",
    "American Indian/Alaska Native Foods",
    "Meals, Entrees, and Side Dishes",
}

# Survey/FNDDS kategori adları (wweiaFoodCategoryDescription) TAMAMEN farklı
# bir sözlük kullanıyor (172 kısa, tüketici-dostu ifade — "Oatmeal",
# "Burgers" vb.) — bebek maması/mama/anne sütü gibi yetişkin beslenme
# takibiyle alakasız olanlar burada elenir.
EXCLUDED_SURVEY_CATEGORIES = {
    "Baby food: cereals",
    "Baby food: fruit",
    "Baby food: meat and dinners",
    "Baby food: mixtures",
    "Baby food: snacks and sweets",
    "Baby food: vegetables",
    "Baby food: yogurt",
    "Baby juice",
    "Baby water",
    "Formula, prepared from powder",
    "Formula, ready-to-feed",
    "Human milk",
    "Not included in a food category",
}

# Kesim/hazırlama varyasyonunun çok fazla tekrar ettiği (ör. "Beef, chuck,
# arm pot roast, ..." gibi onlarca kesim/pişirme kombinasyonu) et kategorileri
# — bunlarda gruplama anahtarı ilk İKİ virgüllü segment (temel + kesim),
# diğer kategorilerde ilk segment (temel besin) yeterli. SADECE SR Legacy'de
# uygulanıyor (Foundation/Survey zaten USDA tarafından ön-küratörlü, aşırı
# kesim/varyant tekrarı yok — grup limiti onlara uygulanmıyor).
MEAT_CATEGORIES = {
    "Beef Products",
    "Lamb, Veal, and Game Products",
    "Poultry Products",
    "Pork Products",
    "Finfish and Shellfish Products",
    "Sausages and Luncheon Meats",
}

# 2026-08-01: 3 (grup başına en fazla) → 5'e çıkarıldı. Kullanıcı isteğiyle
# "daha fazla veri" hedeflendi; ayrıca 3'lük limit daha önce gerçek bir
# regresyona yol açmıştı (kırmızı domates "Tomatoes, red, ripe, raw, year
# round average" açıklaması yeşil/sarı/turuncu varyantlardan UZUN olduğu
# için 3'lük grupta elenmişti — bkz. fuzzy_match.py'deki "domates/domates
# tozu" fix'i ve bu dosyanın git geçmişi). 5 bu riski azaltır ama TAMAMEN
# ortadan kaldırmaz — hâlâ bilinçli bir sınır, mükemmel değil.
VARIANTS_PER_GROUP = 5

# nutrient id -> hedef alan (USDA'nın 3 veri tipinde de aynı nutrient id
# şeması kullanılıyor)
NUTRIENT_IDS = {
    1008: "calories_kcal",
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbs_g",
    1079: "fiber_g",
    2000: "sugar_g",
    1093: "sodium_mg",
}


def _group_key(description: str, category: str) -> str:
    segments = [s.strip() for s in description.split(",")]
    depth = 2 if category in MEAT_CATEGORIES else 1
    return ", ".join(segments[:depth]).lower()


def _sort_key(description: str) -> tuple:
    # "raw" olanlar önce (en jenerik/temel hazırlama durumu), sonra kısa
    # açıklamalar önce (aşırı spesifik varyasyonlar elenmiş olur).
    is_raw = 0 if "raw" in description.lower() else 1
    return (is_raw, len(description))


def _extract_nutrients(food: dict) -> dict[str, float] | None:
    values: dict[str, float] = {}
    for nutrient in food.get("foodNutrients", []):
        nutrient_id = nutrient.get("nutrient", {}).get("id")
        field = NUTRIENT_IDS.get(nutrient_id)
        if field:
            values[field] = nutrient.get("amount")

    required = {"calories_kcal", "protein_g", "fat_g", "carbs_g"}
    if not required.issubset(values):
        return None  # temel makro değerlerinden biri eksikse kullanılamaz
    values.setdefault("fiber_g", None)
    values.setdefault("sugar_g", None)
    values.setdefault("sodium_mg", None)
    return values


def _curate_grouped(foods: list[dict], data_type: str) -> list[dict]:
    """SR Legacy / Foundation için: kategoriye göre grupla, grup başına en
    fazla VARIANTS_PER_GROUP varyant al (aşırı kesim/varyant tekrarını
    engellemek için)."""
    groups: dict[str, list[dict]] = {}
    for food in foods:
        if food is None:
            continue  # Foundation Foods JSON'unda geri çekilmiş/boş kayıtlar null olarak geliyor
        category = (food.get("foodCategory") or {}).get("description", "")
        if category in EXCLUDED_CATEGORIES:
            continue

        nutrients = _extract_nutrients(food)
        if nutrients is None:
            continue

        description = food["description"]
        record = {
            "fdc_id": food["fdcId"],
            "name_en": description,
            "data_type": data_type,
            "category_en": category,
            **nutrients,
        }
        key = f"{category}::{_group_key(description, category)}"
        groups.setdefault(key, []).append(record)

    curated: list[dict] = []
    for records in groups.values():
        records.sort(key=lambda r: _sort_key(r["name_en"]))
        curated.extend(records[:VARIANTS_PER_GROUP])
    return curated


def _curate_survey(foods: list[dict]) -> list[dict]:
    """Survey/FNDDS için: USDA açıklamaları zaten tüketici-dostu/kısa
    ("Milk, NFS", "Chicken breast, roasted" tarzı) — SR Legacy'deki gibi
    onlarca ince kesim/hazırlama varyantı tekrarı YOK, bu yüzden grup-başına
    limit uygulanmıyor, sadece hariç tutulan kategoriler + eksik besin
    değeri filtreleniyor."""
    curated: list[dict] = []
    for food in foods:
        if food is None:
            continue
        category = (food.get("wweiaFoodCategory") or {}).get("wweiaFoodCategoryDescription", "")
        if category in EXCLUDED_SURVEY_CATEGORIES:
            continue

        nutrients = _extract_nutrients(food)
        if nutrients is None:
            continue

        curated.append(
            {
                "fdc_id": food["fdcId"],
                "name_en": food["description"],
                "data_type": "survey_fndds_food",
                "category_en": category,
                **nutrients,
            }
        )
    return curated


def curate() -> list[dict]:
    curated: list[dict] = []

    if SR_LEGACY_PATH.exists():
        with open(SR_LEGACY_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        sr_curated = _curate_grouped(raw["SRLegacyFoods"], "sr_legacy_food")
        print(f"[sr_legacy] {len(raw['SRLegacyFoods'])} ham -> {len(sr_curated)} küratörlü")
        curated.extend(sr_curated)
    else:
        print(f"[sr_legacy] ATLANDI, bulunamadı: {SR_LEGACY_PATH}")

    if FOUNDATION_PATH.exists():
        with open(FOUNDATION_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        fnd_curated = _curate_grouped(raw["FoundationFoods"], "foundation_food")
        print(f"[foundation] {len(raw['FoundationFoods'])} ham -> {len(fnd_curated)} küratörlü")
        curated.extend(fnd_curated)
    else:
        print(f"[foundation] ATLANDI, bulunamadı: {FOUNDATION_PATH}")

    if SURVEY_PATH.exists():
        with open(SURVEY_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        survey_curated = _curate_survey(raw["SurveyFoods"])
        print(f"[survey_fndds] {len(raw['SurveyFoods'])} ham -> {len(survey_curated)} küratörlü")
        curated.extend(survey_curated)
    else:
        print(f"[survey_fndds] ATLANDI, bulunamadı: {SURVEY_PATH}")

    # fdc_id USDA genelinde global olarak benzersiz (3 veri tipi arasında da) —
    # ama emin olmak için tekilleştirme kontrolü.
    seen: set[int] = set()
    deduped: list[dict] = []
    for record in curated:
        if record["fdc_id"] in seen:
            continue
        seen.add(record["fdc_id"])
        deduped.append(record)
    if len(deduped) != len(curated):
        print(f"UYARI: {len(curated) - len(deduped)} fdc_id çakışması bulundu, tekilleştirildi")

    return deduped


def main() -> None:
    if not any(p.exists() for p in (SR_LEGACY_PATH, FOUNDATION_PATH, SURVEY_PATH)):
        raise SystemExit(
            "Hiçbir ham USDA veri dosyası bulunamadı. fdc.nal.usda.gov/download-datasets "
            "sayfasından ilgili veri setlerini indirip data_sources/usda/ altına açın."
        )

    curated = curate()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(curated, f, ensure_ascii=False, indent=2)

    print(f"TOPLAM: {len(curated)} besin kaydı küratörlü alt kümeye alındı -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
