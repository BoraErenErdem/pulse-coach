import sqlite3

from app.config import get_settings
from app.services import backup_service


def _make_sqlite_db(path) -> None:
    conn = sqlite3.connect(str(path))
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)")
    conn.execute("INSERT INTO t (value) VALUES ('hello')")
    conn.commit()
    conn.close()


def test_backup_database_creates_a_consistent_copy(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    _make_sqlite_db(db_path)
    monkeypatch.setattr(get_settings(), "database_url", f"sqlite:///{db_path}")

    backup_path = backup_service.backup_database()

    assert backup_path is not None
    assert backup_path.exists()
    assert backup_path.parent.name == "backups"

    conn = sqlite3.connect(str(backup_path))
    rows = conn.execute("SELECT value FROM t").fetchall()
    conn.close()
    assert rows == [("hello",)]


def test_backup_database_prunes_old_backups_beyond_limit(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    _make_sqlite_db(db_path)
    monkeypatch.setattr(get_settings(), "database_url", f"sqlite:///{db_path}")
    monkeypatch.setattr(get_settings(), "backup_max_to_keep", 2)

    created = [backup_service.backup_database() for _ in range(4)]

    backups_dir = db_path.parent / "backups"
    remaining = sorted(backups_dir.glob("test_*.db"))
    assert len(remaining) == 2
    # En yeni 2 yedek kalmalı, en eski 2'si silinmiş olmalı.
    assert set(remaining) == set(created[-2:])


def test_backup_database_returns_none_for_non_sqlite_url(monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "postgresql://user:pass@localhost/db")
    assert backup_service.backup_database() is None


def test_backup_database_returns_none_when_db_file_missing(tmp_path, monkeypatch):
    missing_path = tmp_path / "does-not-exist.db"
    monkeypatch.setattr(get_settings(), "database_url", f"sqlite:///{missing_path}")
    assert backup_service.backup_database() is None
