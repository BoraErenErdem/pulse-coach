"""Canlıya çıkış adımı (2026-09-30): her dağıtımda, web ve worker süreçleri
başlamadan ÖNCE bir kez çalışır. Tamamı idempotent - tekrar çalıştırmak güvenli.

1. `alembic upgrade head`
2. Katalog boşsa (ilk kurulum) `--catalog-snapshot` dosyasından yükler
   (bkz. scripts/export_catalog_snapshot.py).
3. Git'teki katalog güncellemelerini uygular (sırası önemli):
   egzersiz seed'i (data_sources/exercises) -> Türk mutfağı besinleri ->
   besin adı düzeltmeleri -> egzersiz yeniden adlandırmaları (geçmiş setler dahil).
4. Ollama gömme önbelleklerini ısıtır (RAG FAISS indeksleri, egzersiz katalog
   vektörleri) - aksi halde ilk kullanıcılar bunları beklerdi ve birden fazla
   web süreci aynı anda hesaplamaya girişirdi. Ollama ayakta olmalı; olmadan
   denemek için --skip-warmup.

Kullanım (backend/ dizininden, DATABASE_URL canlı veritabanını gösterirken):
    python -m scripts.release --catalog-snapshot /workspace/catalog_snapshot.db
"""

import argparse
import sys
import time
from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _step(title: str) -> None:
    print(f"\n==> {title}", flush=True)


def migrate() -> None:
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")


def load_catalog_if_empty(snapshot: Path | None) -> None:
    from app.config import get_settings
    from app.db.session import SessionLocal
    from app.models.exercise_catalog import ExerciseCatalog
    from app.models.food_catalog import FoodCatalog

    with SessionLocal() as db:
        foods = db.query(FoodCatalog).count()
        exercises = db.query(ExerciseCatalog).count()
    if foods and exercises:
        print(f"Katalog dolu ({foods} besin, {exercises} egzersiz) - yükleme atlandı.")
        return
    if foods or exercises:
        raise SystemExit(f"Katalog yarım ({foods} besin, {exercises} egzersiz) - elle incelenmeli.")
    if snapshot is None:
        raise SystemExit("Katalog boş: --catalog-snapshot <dosya> gerekli (scripts.export_catalog_snapshot).")
    if not snapshot.is_file():
        raise SystemExit(f"Katalog dosyası bulunamadı: {snapshot}")

    from scripts.sqlite_to_postgres import transfer

    report = transfer(f"sqlite:///{snapshot.resolve()}", get_settings().database_url, only_catalogs=True, dry_run=False)
    for name, info in report.items():
        print(f"{name}: {info['copied']}/{info['source']}")


def apply_catalog_updates() -> None:
    from app.db.session import SessionLocal
    from scripts.exercise_catalog_renames import apply_renames
    from scripts.food_catalog_fixes import apply_name_fixes
    from scripts.seed_catalogs import seed_exercises
    from scripts.seed_tr_foods import seed_tr_foods

    print(f"[exercise_catalog] {seed_exercises()} kayıt güncellendi (upsert)")
    print(f"[food_catalog] {seed_tr_foods()} Türk mutfağı besini (upsert)")
    with SessionLocal() as db:
        print(f"[food_catalog] {apply_name_fixes(db)} isim düzeltildi")
    with SessionLocal() as db:
        catalog, sets, goals = apply_renames(db)
    print(f"[exercise_catalog] {catalog} ad, {sets} set, {goals} hedef yeniden adlandırıldı")


def warmup() -> None:
    from app.db.session import SessionLocal
    from app.rag.vector_store import get_vector_store
    from app.services import exercise_catalog_service
    from app.services.exercise_resolver import _catalog_vectors

    for category in ("nutrition", "exercise"):
        started = time.monotonic()
        get_vector_store(category)
        print(f"[rag] {category} indeksi hazır ({time.monotonic() - started:.1f} sn)")
    started = time.monotonic()
    with SessionLocal() as db:
        rows = exercise_catalog_service.all_rows(db)
        if not _catalog_vectors().nearest(rows, "squat", 1):
            raise SystemExit("Egzersiz katalog vektörleri hazırlanamadı (Ollama / nomic-embed-text?).")
    print(f"[catalog_vectors] exercise hazır ({time.monotonic() - started:.1f} sn)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog-snapshot", type=Path, default=None)
    parser.add_argument("--skip-warmup", action="store_true", help="Ollama gerektiren önbellek ısıtmayı atla")
    args = parser.parse_args(argv)

    _step("Migration (alembic upgrade head)")
    migrate()
    _step("Katalog")
    load_catalog_if_empty(args.catalog_snapshot)
    _step("Katalog güncellemeleri")
    apply_catalog_updates()
    if args.skip_warmup:
        _step("Önbellek ısıtma ATLANDI (--skip-warmup)")
    else:
        _step("Önbellek ısıtma (Ollama)")
        warmup()
    print("\nRelease tamam.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
