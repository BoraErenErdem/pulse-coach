"""Besin/egzersiz kataloğunu küçük, kullanıcı verisi İÇERMEYEN bir SQLite
dosyasına çıkarır (2026-09-30) - canlı sunucuya yalnız bu dosya gönderilir,
`scripts.release --catalog-snapshot` onu boş Postgres'e yükler.

Neden: besin kataloğunun kaynağı (data_sources/usda) git'te değil, doğru hâli
yalnız geliştirme veritabanında. Tüm geliştirme DB'sini (test hesaplarının
sağlık verisiyle) sunucuya taşımak gereksiz bir veri aktarımı olurdu.

Kullanım (backend/ dizininden):
    python -m scripts.export_catalog_snapshot --source sqlite:///./health_coach.db --output catalog_snapshot.db
"""

import argparse
from pathlib import Path

from sqlalchemy import create_engine, func, select

import app.models  # noqa: F401 - tüm modelleri Base.metadata'ya kaydeder
from app.db.base import Base
from app.db.session import engine_options

CATALOG_TABLES = ("food_catalog", "exercise_catalog")
BATCH_SIZE = 1000


def export_snapshot(source_url: str, output: Path) -> dict[str, int]:
    if output.exists():
        raise SystemExit(f"{output} zaten var - üzerine yazılmaz, önce silin.")
    source = create_engine(source_url, **engine_options(source_url))
    target = create_engine(f"sqlite:///{output}")
    tables = [Base.metadata.tables[name] for name in CATALOG_TABLES]
    Base.metadata.create_all(bind=target, tables=tables)
    counts: dict[str, int] = {}
    with source.connect() as src, target.begin() as dst:
        for table in tables:
            rows = [dict(row._mapping) for row in src.execute(select(table))]
            for start in range(0, len(rows), BATCH_SIZE):
                dst.execute(table.insert(), rows[start : start + BATCH_SIZE])
            counts[table.name] = dst.execute(select(func.count()).select_from(table)).scalar() or 0
            if counts[table.name] != len(rows):
                raise SystemExit(f"Sayım uyuşmuyor: {table.name}")
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default="sqlite:///./health_coach.db")
    parser.add_argument("--output", default="catalog_snapshot.db")
    args = parser.parse_args(argv)
    for name, count in export_snapshot(args.source, Path(args.output)).items():
        print(f"{name}: {count}")
    print(f"Katalog dosyası: {Path(args.output).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
