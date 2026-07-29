"""Egzersiz/besin katalogları için ham açık veri kaynaklarını indirir.
Her ikisi de API key gerektirmez (toplu/statik dosya indirme).

- free-exercise-db (Unlicense, github.com/yuhonas/free-exercise-db): küçük
  olduğu için repoya vendor edilmiştir (data_sources/exercises/exercises.json,
  commit edilir) — zaten yoksa burada da indirilebilir.
- USDA FoodData Central SR Legacy (CC0, fdc.nal.usda.gov): ~200MB açılmış
  JSON, .gitignore'da, yerelde cache'lenir.

Kullanım: python -m scripts.download_sources
"""

import io
import zipfile
from pathlib import Path

import requests

BACKEND_DIR = Path(__file__).resolve().parents[1]
EXERCISES_PATH = BACKEND_DIR / "data_sources" / "exercises" / "exercises.json"
EXERCISES_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

USDA_DIR = BACKEND_DIR / "data_sources" / "usda"
USDA_JSON_PATH = USDA_DIR / "FoodData_Central_sr_legacy_food_json_2018-04.json"
USDA_ZIP_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"


def download_exercises() -> None:
    if EXERCISES_PATH.exists():
        print(f"[exercises] zaten mevcut: {EXERCISES_PATH}")
        return
    EXERCISES_PATH.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(EXERCISES_URL, timeout=60)
    response.raise_for_status()
    EXERCISES_PATH.write_bytes(response.content)
    print(f"[exercises] indirildi -> {EXERCISES_PATH}")


def download_usda() -> None:
    if USDA_JSON_PATH.exists():
        print(f"[usda] zaten mevcut: {USDA_JSON_PATH}")
        return
    USDA_DIR.mkdir(parents=True, exist_ok=True)
    response = requests.get(USDA_ZIP_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=120)
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        zf.extractall(USDA_DIR)
    print(f"[usda] indirildi ve açıldı -> {USDA_JSON_PATH}")


def main() -> None:
    download_exercises()
    download_usda()


if __name__ == "__main__":
    main()
