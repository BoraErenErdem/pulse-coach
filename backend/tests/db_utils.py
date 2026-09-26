"""Testlerin veritabanı motoru (2026-09-26).

Varsayılan: her çağrıda ayrı, bellekte bir SQLite (eski davranış). Ortamda
TEST_DATABASE_URL (ör. postgresql+psycopg://...) varsa aynı testler Postgres'e
karşı çalışır - her motor kendi rastgele şemasını alır, böylece SQLite'taki gibi
birbirinden yalıtılır. Şemalar oturum sonunda silinir; silinemeyenler (ör. açık
kalan bağlantı) bir sonraki oturumun başında temizlenir.
"""

import atexit
import os
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

_SCHEMA_PREFIX = "pytest_"
_created_schemas: list[str] = []
_stale_cleaned = False


def _drop_schemas(url: str, schemas: list[str]) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            for schema in schemas:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    except Exception:  # noqa: BLE001 - temizlik en iyi çaba; test sonucunu etkilememeli
        pass
    finally:
        engine.dispose()


def _stale_schemas(url: str) -> list[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE :p"),
                {"p": f"{_SCHEMA_PREFIX}%"},
            )
            return [row[0] for row in rows]
    finally:
        engine.dispose()


def make_test_engine() -> Engine:
    global _stale_cleaned
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        return create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    if not _stale_cleaned:
        _drop_schemas(url, _stale_schemas(url))
        _stale_cleaned = True

    schema = f"{_SCHEMA_PREFIX}{uuid.uuid4().hex[:12]}"
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    admin.dispose()
    _created_schemas.append(schema)
    # Uygulamanın kendi motoru gibi oturum saat dilimi UTC (bkz. app/db/session.py).
    return create_engine(url, connect_args={"options": f"-c search_path={schema} -c timezone=UTC"})


@atexit.register
def _drop_created_schemas() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if url and _created_schemas:
        _drop_schemas(url, _created_schemas)


def seed_exercise_catalog(session, catalog_id: int) -> None:
    """exercise_catalog_id kullanan testler için gerçek bir katalog satırı.
    SQLite yabancı anahtarları denetlemiyor, Postgres denetliyor - var olmayan
    bir kimliğe bağlanan kayıt orada reddedilir."""
    from app.models.exercise_catalog import ExerciseCatalog

    session.add(
        ExerciseCatalog(
            id=catalog_id,
            source_id=f"test-{catalog_id}",
            name_en="Test Exercise",
            name_tr="Test Egzersizi",
            category_tr="kuvvet",
            primary_muscles_tr="bacak",
            level_tr="başlangıç",
        )
    )
    session.commit()
