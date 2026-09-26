"""SQLite -> Postgres veri aktarımı (2026-09-26), canlıya geçiş için tek seferlik.

Katalog kaynak verisi (data_sources/usda) git'te değil; besin/egzersiz kataloğu
geliştirme SQLite veritabanında duruyor. Bu betik o veriyi (istenirse kullanıcı
verisiyle birlikte) boş bir Postgres'e taşır.

Kullanım (backend/ dizininden):
    DATABASE_URL=postgresql+psycopg://... python -m alembic upgrade head
    python -m scripts.sqlite_to_postgres --source sqlite:///./health_coach.db \\
        --target postgresql+psycopg://... [--only-catalogs] [--dry-run]

Kurallar:
- Hedef şema önceden `alembic upgrade head` ile kurulmuş ve BOŞ olmalı (dolu
  tablo varsa betik durur - yanlışlıkla canlı veriyi ezmemek için).
- SQLite yabancı anahtarları denetlemiyor, Postgres denetliyor. Var olmayan bir
  satıra işaret eden (yetim) bağlantı boş bırakılabiliyorsa NULL'a çekilir,
  zorunluysa satır atlanır; ikisi de raporlanır.
- Kimlikler korunur, ardından Postgres dizileri (sequence) en büyük kimliğe ayarlanır.
- Tamamı tek transaction: bir hata olursa hedefte hiçbir şey kalmaz.
"""

import argparse
import sys

from sqlalchemy import Table, create_engine, func, inspect, select, text
from sqlalchemy.engine import Connection

import app.models  # noqa: F401 - tüm modelleri Base.metadata'ya kaydeder
from app.db.base import Base
from app.db.session import engine_options

CATALOG_TABLES = {"food_catalog", "exercise_catalog"}
# Güvenlik artefaktları - taşınmaz; kullanıcılar yeniden giriş yapar.
SKIPPED_TABLES = {"refresh_tokens", "password_reset_tokens", "rate_limit_attempts"}
BATCH_SIZE = 1000


def _plan_tables(only_catalogs: bool) -> list[Table]:
    tables = []
    for table in Base.metadata.sorted_tables:  # yabancı anahtar sırasına göre
        if table.name in SKIPPED_TABLES:
            continue
        if only_catalogs and table.name not in CATALOG_TABLES:
            continue
        tables.append(table)
    return tables


def _assert_target_empty(conn: Connection, tables: list[Table]) -> None:
    filled = [t.name for t in tables if conn.execute(select(func.count()).select_from(t)).scalar()]
    if filled:
        raise SystemExit(f"Hedef boş değil, aktarım durduruldu: {', '.join(filled)}")


def transfer(source_url: str, target_url: str, only_catalogs: bool, dry_run: bool) -> dict[str, dict]:
    source = create_engine(source_url, **engine_options(source_url))
    target = create_engine(target_url, **engine_options(target_url))
    if target.dialect.name != "postgresql":
        raise SystemExit("Hedef bir Postgres URL'si olmalı.")
    missing = set(Base.metadata.tables) - set(inspect(target).get_table_names())
    if missing:
        raise SystemExit(f"Hedef şema eksik ({', '.join(sorted(missing))}) - önce `alembic upgrade head`.")

    tables = _plan_tables(only_catalogs)
    report: dict[str, dict] = {}
    with source.connect() as src, target.begin() as dst:
        _assert_target_empty(dst, tables)
        copied_ids: dict[str, set] = {}
        for table in tables:
            source_columns = {c["name"] for c in inspect(src).get_columns(table.name)}
            columns = [c for c in table.columns if c.name in source_columns]
            rows = [dict(row._mapping) for row in src.execute(select(*columns))]
            nulled = skipped = 0
            kept = []
            for row in rows:
                ok = True
                for fk in table.foreign_keys:
                    value = row.get(fk.parent.name)
                    parent = fk.column.table.name
                    if value is None or parent not in copied_ids:
                        # Üst tablo aktarılmıyorsa (ör. yalnızca katalog) denetlenmez.
                        continue
                    if value not in copied_ids[parent]:
                        if fk.parent.nullable:
                            row[fk.parent.name] = None
                            nulled += 1
                        else:
                            ok = False
                if ok:
                    kept.append(row)
                else:
                    skipped += 1
            if not dry_run:
                for start in range(0, len(kept), BATCH_SIZE):
                    dst.execute(table.insert(), kept[start : start + BATCH_SIZE])
            if "id" in table.c:
                copied_ids[table.name] = {row["id"] for row in kept}
            report[table.name] = {"source": len(rows), "copied": len(kept), "fk_nulled": nulled, "skipped": skipped}

        if not dry_run:
            for table in tables:
                if "id" in table.c:
                    dst.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table.name}), 1), "
                            f"(SELECT MAX(id) FROM {table.name}) IS NOT NULL)"
                        )
                    )
            for table in tables:
                count = dst.execute(select(func.count()).select_from(table)).scalar()
                if count != report[table.name]["copied"]:
                    raise SystemExit(f"Sayım uyuşmuyor: {table.name} {count} != {report[table.name]['copied']}")
        else:
            dst.rollback()
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True, help="sqlite:///./health_coach.db")
    parser.add_argument("--target", required=True, help="postgresql+psycopg://kullanici:sifre@host/db")
    parser.add_argument("--only-catalogs", action="store_true", help="Yalnızca besin/egzersiz kataloğu")
    parser.add_argument("--dry-run", action="store_true", help="Yazmadan raporla")
    args = parser.parse_args(argv)

    report = transfer(args.source, args.target, args.only_catalogs, args.dry_run)
    for name, info in report.items():
        extra = []
        if info["fk_nulled"]:
            extra.append(f"{info['fk_nulled']} yetim bağlantı NULL")
        if info["skipped"]:
            extra.append(f"{info['skipped']} satır atlandı")
        suffix = f" ({'; '.join(extra)})" if extra else ""
        print(f"{name}: {info['copied']}/{info['source']}{suffix}")
    print("KURU ÇALIŞMA - hiçbir şey yazılmadı." if args.dry_run else "Aktarım tamam.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
