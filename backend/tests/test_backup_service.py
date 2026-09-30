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


def test_backup_database_returns_none_for_unsupported_url(monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "mysql://user:pass@localhost/db")
    assert backup_service.backup_database() is None


def test_backup_database_returns_none_when_db_file_missing(tmp_path, monkeypatch):
    missing_path = tmp_path / "does-not-exist.db"
    monkeypatch.setattr(get_settings(), "database_url", f"sqlite:///{missing_path}")
    assert backup_service.backup_database() is None


class _Completed:
    def __init__(self, returncode=0, stderr=""):
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = ""


def _fake_pg_dump(calls, returncode=0):
    def run(args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == "pg_dump" and returncode == 0:
            output = next(a.split("=", 1)[1] for a in args if a.startswith("--file="))
            with open(output, "wb") as f:
                f.write(b"PGDMP")
        return _Completed(returncode=returncode, stderr="pg_dump: error: connection refused" if returncode else "")

    return run


def test_postgres_backup_runs_pg_dump_without_password_on_command_line(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "postgresql+psycopg://coach:s3cret@db.local:5433/pulse")
    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path))
    calls = []
    monkeypatch.setattr(backup_service.subprocess, "run", _fake_pg_dump(calls))

    backup_path = backup_service.backup_database()

    assert backup_path is not None and backup_path.suffix == ".dump"
    assert backup_path.read_bytes() == b"PGDMP"
    args, kwargs = calls[0]
    assert "--format=custom" in args
    assert "--host=db.local" in args and "--port=5433" in args
    assert "--username=coach" in args and "--dbname=pulse" in args
    assert not any("s3cret" in a for a in args)
    assert kwargs["env"]["PGPASSWORD"] == "s3cret"
    assert not list(tmp_path.glob("*.partial"))


def test_failed_pg_dump_raises_and_keeps_existing_backups(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "postgresql+psycopg://coach:pw@localhost/pulse")
    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path))
    monkeypatch.setattr(get_settings(), "backup_max_to_keep", 1)
    old = tmp_path / "pulsecoach_20260101_030000_000000.dump"
    old.write_bytes(b"PGDMP-old")
    monkeypatch.setattr(backup_service.subprocess, "run", _fake_pg_dump([], returncode=1))

    try:
        backup_service.backup_database()
    except backup_service.BackupError as exc:
        assert "connection refused" in str(exc)
    else:
        raise AssertionError("BackupError bekleniyordu")

    assert old.exists()
    assert not list(tmp_path.glob("*.partial"))


def test_postgres_backups_are_pruned_and_copied_offsite(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "postgresql+psycopg://coach:pw@localhost/pulse")
    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path))
    monkeypatch.setattr(get_settings(), "backup_max_to_keep", 2)
    monkeypatch.setattr(get_settings(), "backup_rclone_remote", "pulse-crypt:db/")
    calls = []
    monkeypatch.setattr(backup_service.subprocess, "run", _fake_pg_dump(calls))

    created = [backup_service.backup_database() for _ in range(3)]

    assert set(tmp_path.glob("pulsecoach_*.dump")) == set(created[-2:])
    rclone_calls = [args for args, _ in calls if args[0] == "rclone"]
    last = created[-1]
    assert last is not None
    assert ["rclone", "copyto", str(last), f"pulse-crypt:db/{last.name}"] in rclone_calls
    assert any(a[1] == "delete" and "--min-age=30d" in a and "--include=pulsecoach_*.dump" in a for a in rclone_calls)


def test_latest_backup_time_reads_newest_file(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "database_url", "postgresql+psycopg://coach:pw@localhost/pulse")
    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path))
    assert backup_service.latest_backup_time(get_settings().database_url) is None
    (tmp_path / "pulsecoach_x.dump").write_bytes(b"PGDMP")
    assert backup_service.latest_backup_time(get_settings().database_url) is not None
