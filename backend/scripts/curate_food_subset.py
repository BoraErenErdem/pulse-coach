"""USDA SR Legacy ham JSON'undan Türk mutfağına/günlük kullanıma uygun,
küratörlü bir besin alt kümesi (~1.500-2.000 kayıt) çıkarır.

Ham veri `data_sources/usda/FoodData_Central_sr_legacy_food_json_2018-04.json`
altında bulunmalı (download-datasets sayfasından elle indirilip unzip edilir,
repoya commit edilmez — .gitignore'da).

Kullanım: python -m scripts.curate_food_subset
Çıktı: data_sources/usda/curated_subset.json
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data_sources" / "usda"
RAW_PATH = DATA_DIR / "FoodData_Central_sr_legacy_food_json_2018-04.json"
OUTPUT_PATH = DATA_DIR / "curated_subset.json"

# Kullanıcıya pratikte hitap etmeyen kategoriler (ABD'ye özgü fast-food/
# restoran zinciri isimleri, bebek maması, çok spesifik yerel mutfak vb.)
EXCLUDED_CATEGORIES = {
    "Fast Foods",
    "Restaurant Foods",
    "Baby Foods",
    "American Indian/Alaska Native Foods",
    "Meals, Entrees, and Side Dishes",
}

# Kesim/hazırlama varyasyonunun çok fazla tekrar ettiği (ör. "Beef, chuck,
# arm pot roast, ..." gibi onlarca kesim/pişirme kombinasyonu) et kategorileri
# — bunlarda gruplama anahtarı ilk İKİ virgüllü segment (temel + kesim),
# diğer kategorilerde ilk segment (temel besin) yeterli.
MEAT_CATEGORIES = {
    "Beef Products",
    "Lamb, Veal, and Game Products",
    "Poultry Products",
    "Pork Products",
    "Finfish and Shellfish Products",
    "Sausages and Luncheon Meats",
}

VARIANTS_PER_GROUP = 3

# nutrient id -> hedef alan
NUTRIENT_IDS = {
    1008: "calories_kcal",
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbs_g",
    1079: "fiber_g",
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
    return values


def curate() -> list[dict]:
    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    groups: dict[str, list[dict]] = {}
    for food in raw["SRLegacyFoods"]:
        category = food.get("foodCategory", {}).get("description", "")
        if category in EXCLUDED_CATEGORIES:
            continue

        nutrients = _extract_nutrients(food)
        if nutrients is None:
            continue

        description = food["description"]
        record = {
            "fdc_id": food["fdcId"],
            "name_en": description,
            "data_type": "sr_legacy_food",
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


def main() -> None:
    if not RAW_PATH.exists():
        raise SystemExit(
            f"Ham USDA verisi bulunamadı: {RAW_PATH}\n"
            "fdc.nal.usda.gov/download-datasets sayfasından 'SR Legacy' JSON "
            "veri setini indirip data_sources/usda/ altına açın."
        )

    curated = curate()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(curated, f, ensure_ascii=False, indent=2)

    print(f"{len(curated)} besin kaydı küratörlü alt kümeye alındı -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
