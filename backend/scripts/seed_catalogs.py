"""Çevrilmiş egzersiz/besin verisini ExerciseCatalog/FoodCatalog tablolarına
seed eder. `source_id`/`fdc_id` doğal anahtarıyla upsert yapar (idempotent) —
tekrar çalıştırmak veri tekrarına yol açmaz.

Ön koşul: `scripts.download_sources` (ham veri) ve `scripts.curate_food_subset`
+ `scripts.translate_catalog` (küratörlü/çevrilmiş veri + cache) çalıştırılmış
olmalı.

Kullanım:
    python -m scripts.seed_catalogs                  # ikisi de, zaten doluysa atlar
    python -m scripts.seed_catalogs --only exercise
    python -m scripts.seed_catalogs --only food
    python -m scripts.seed_catalogs --force           # dolu olsa bile yeniden seed et
    python -m scripts.seed_catalogs --limit 50        # hızlı deneme
"""

import argparse
import json
from pathlib import Path

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.exercise_catalog import ExerciseCatalog
from app.models.food_catalog import FoodCatalog
from scripts.vocab_tr import (
    EQUIPMENT_TR,
    EXERCISE_CATEGORY_TR,
    FOOD_CATEGORY_TR,
    FORCE_TR,
    LEVEL_TR,
    MECHANIC_TR,
    MUSCLE_TR,
    join_tr,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
EXERCISES_RAW_PATH = BACKEND_DIR / "data_sources" / "exercises" / "exercises.json"
EXERCISES_CACHE_PATH = BACKEND_DIR / "data_sources" / "exercises" / "translated_cache.json"
FOODS_RAW_PATH = BACKEND_DIR / "data_sources" / "usda" / "curated_subset.json"
FOODS_CACHE_PATH = BACKEND_DIR / "data_sources" / "usda" / "translated_cache.json"

BATCH_SIZE = 500


def _load_json(path: Path, default):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def seed_exercises(limit: int | None = None) -> int:
    raw = _load_json(EXERCISES_RAW_PATH, [])
    cache = _load_json(EXERCISES_CACHE_PATH, {})
    if limit:
        raw = raw[:limit]

    db = SessionLocal()
    try:
        existing_ids = {row.source_id for row in db.query(ExerciseCatalog.source_id).all()}
        count = 0
        for ex in raw:
            source_id = ex["id"]
            translated = cache.get(source_id, {})
            name_tr = translated.get("name_tr", ex["name"])
            instructions_tr = translated.get("instructions_tr")
            is_translated = translated.get("is_translated", False)

            values = dict(
                name_en=ex["name"],
                name_tr=name_tr,
                category_tr=EXERCISE_CATEGORY_TR.get(ex["category"], ex["category"]),
                equipment_tr=EQUIPMENT_TR.get(ex.get("equipment"), ex.get("equipment")),
                primary_muscles_tr=join_tr(ex.get("primaryMuscles", []), MUSCLE_TR),
                secondary_muscles_tr=join_tr(ex.get("secondaryMuscles", []), MUSCLE_TR) or None,
                level_tr=LEVEL_TR.get(ex["level"], ex["level"]),
                force_tr=FORCE_TR.get(ex.get("force"), ex.get("force")),
                mechanic_tr=MECHANIC_TR.get(ex.get("mechanic"), ex.get("mechanic")),
                instructions_tr=instructions_tr,
                is_translated=is_translated,
            )

            if source_id in existing_ids:
                db.query(ExerciseCatalog).filter(ExerciseCatalog.source_id == source_id).update(values)
            else:
                db.add(ExerciseCatalog(source_id=source_id, **values))

            count += 1
            if count % BATCH_SIZE == 0:
                db.commit()
        db.commit()
        return count
    finally:
        db.close()


def seed_foods(limit: int | None = None) -> int:
    raw = _load_json(FOODS_RAW_PATH, [])
    cache = _load_json(FOODS_CACHE_PATH, {})
    if limit:
        raw = raw[:limit]

    db = SessionLocal()
    try:
        existing_ids = {row.fdc_id for row in db.query(FoodCatalog.fdc_id).all()}
        count = 0
        for food in raw:
            fdc_id = food["fdc_id"]
            translated = cache.get(str(fdc_id), {})
            name_tr = translated.get("name_tr", food["name_en"])
            is_translated = translated.get("is_translated", False)

            values = dict(
                name_en=food["name_en"],
                name_tr=name_tr,
                data_type=food["data_type"],
                category_tr=FOOD_CATEGORY_TR.get(food.get("category_en"), food.get("category_en")),
                calories_kcal=food["calories_kcal"],
                protein_g=food["protein_g"],
                carbs_g=food["carbs_g"],
                fat_g=food["fat_g"],
                fiber_g=food.get("fiber_g"),
                sugar_g=food.get("sugar_g"),
                sodium_mg=food.get("sodium_mg"),
                is_translated=is_translated,
            )

            if fdc_id in existing_ids:
                db.query(FoodCatalog).filter(FoodCatalog.fdc_id == fdc_id).update(values)
            else:
                db.add(FoodCatalog(fdc_id=fdc_id, **values))

            count += 1
            if count % BATCH_SIZE == 0:
                db.commit()
        db.commit()
        return count
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["exercise", "food"], default=None)
    parser.add_argument("--force", action="store_true", help="Tablo zaten doluysa bile yeniden seed et")
    parser.add_argument("--limit", type=int, default=None, help="Hızlı deneme için ilk N kaydı işle")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    exercise_count = db.query(ExerciseCatalog).count()
    food_count = db.query(FoodCatalog).count()
    db.close()

    if args.only in (None, "exercise"):
        if exercise_count > 0 and not args.force:
            print(f"[exercise_catalog] zaten {exercise_count} kayıt var, atlanıyor (--force ile zorla)")
        else:
            n = seed_exercises(limit=args.limit)
            print(f"[exercise_catalog] {n} kayıt seed edildi")

    if args.only in (None, "food"):
        if food_count > 0 and not args.force:
            print(f"[food_catalog] zaten {food_count} kayıt var, atlanıyor (--force ile zorla)")
        else:
            n = seed_foods(limit=args.limit)
            print(f"[food_catalog] {n} kayıt seed edildi")


if __name__ == "__main__":
    main()
