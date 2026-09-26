"""Yalnızca Postgres'e özgü davranışlar (2026-09-26) - TEST_DATABASE_URL bir
Postgres adresi değilse atlanır (CI'daki Postgres işi çalıştırır)."""

import os
from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.food_catalog import FoodCatalog
from app.models.meal_entry import MealEntry
from app.models.user import User
from tests.db_utils import make_test_engine

PG_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="Postgres gerekli")


def _schema_of(engine) -> str:
    with engine.connect() as conn:
        return conn.execute(text("SELECT current_schema()")).scalar()


def test_session_timezone_is_utc_so_timestamps_do_not_shift():
    from app.db.session import engine_options

    engine = create_engine(PG_URL, **engine_options(PG_URL))
    with engine.connect() as conn:
        assert conn.execute(text("SHOW timezone")).scalar() == "UTC"
    engine.dispose()


def test_sqlite_to_postgres_transfer_nulls_orphans_and_resets_sequences(tmp_path):
    from scripts.sqlite_to_postgres import transfer

    source_url = f"sqlite:///{tmp_path / 'source.db'}"
    source = create_engine(source_url)
    Base.metadata.create_all(source)
    with sessionmaker(bind=source)() as s:
        s.add(User(id=5, email="aktarim@example.com", hashed_password="x"))
        s.add(FoodCatalog(id=10, fdc_id=10, data_type="sr_legacy_food", name_en="Egg", name_tr="Yumurta", calories_kcal=155, protein_g=13, carbs_g=1, fat_g=11))
        s.flush()
        common = dict(user_id=5, meal_type="kahvaltı", quantity_grams=100, calories_kcal=155, protein_g=13, carbs_g=1, fat_g=11, log_date=date(2026, 9, 1))
        s.add(MealEntry(id=1, food_catalog_id=10, food_name_snapshot="Yumurta", **common))
        # SQLite yabancı anahtarı denetlemiyor: katalogda olmayan 999'a bağlı yetim kayıt.
        s.add(MealEntry(id=2, food_catalog_id=999, food_name_snapshot="Eski besin", **common))
        s.commit()
    source.dispose()

    target_engine = make_test_engine()
    Base.metadata.create_all(target_engine)
    schema = _schema_of(target_engine)
    target_url = f"{PG_URL}{'&' if '?' in PG_URL else '?'}options=-csearch_path%3D{schema}"

    report = transfer(source_url, target_url, only_catalogs=False, dry_run=False)

    assert report["meal_entries"] == {"source": 2, "copied": 2, "fk_nulled": 1, "skipped": 0}
    with sessionmaker(bind=target_engine)() as s:
        orphan = s.get(MealEntry, 2)
        assert orphan is not None and orphan.food_catalog_id is None and orphan.calories_kcal == 155
        # Dizi en büyük kimliğe ayarlandı: yeni kayıt çakışmadan 6 alır.
        new_user = User(email="yeni@example.com", hashed_password="x")
        s.add(new_user)
        s.commit()
        assert new_user.id == 6

    with pytest.raises(SystemExit, match="Hedef boş değil"):
        transfer(source_url, target_url, only_catalogs=False, dry_run=False)


def test_scheduler_does_not_start_when_another_process_holds_leader_lock(monkeypatch):
    from app.db import session as session_module
    from app.scheduler import scheduler as scheduler_module

    engine = create_engine(PG_URL)
    monkeypatch.setattr(session_module, "engine", engine)
    other = engine.connect()  # "başka süreç" kilidi tutuyor
    try:
        assert other.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": scheduler_module._LEADER_LOCK_KEY}).scalar()
        other.commit()
        assert scheduler_module.start_scheduler() is None

        other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": scheduler_module._LEADER_LOCK_KEY})
        other.commit()
        started = scheduler_module.start_scheduler()
        assert started is not None and started.running
    finally:
        scheduler_module.shutdown_scheduler()
        other.close()
        engine.dispose()
