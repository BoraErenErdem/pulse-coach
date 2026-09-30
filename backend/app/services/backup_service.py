"""Günlük veritabanı yedeği (zamanlayıcı işi, bkz. scheduler.py).

- SQLite: sqlite3'ün online backup API'si - aktif yazma sırasında bile tutarlı
  kopya (ham dosya kopyalamak yarım yazılmış bir anlık görüntü alabilir).
- Postgres (2026-09-30): `pg_dump --format=custom`. Canlıda RunPod Community pod'u
  kalıcı değil (network volume yalnız Secure Cloud'da) - makine giderse /workspace
  da gider. Bu yüzden yerel kopyaya ek olarak `backup_rclone_remote` ayarlıysa
  dosya rclone ile pod DIŞINA kopyalanır (önerilen: şifreli "crypt" remote,
  bkz. deploy/README.md). Sağlık verisi kaybı en ağır risk.

Geri yükleme: `pg_restore --clean --if-exists --no-owner -d <url> <dosya>.dump`
(ayrıntı deploy/README.md)."""

import logging
import os
import re
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config import get_settings

logger = logging.getLogger(__name__)

BACKUP_DIR_NAME = "backups"
POSTGRES_BACKUP_STEM = "pulsecoach"
_PG_DUMP_TIMEOUT_S = 30 * 60
_RCLONE_TIMEOUT_S = 30 * 60

_SQLITE_URL_RE = re.compile(r"^sqlite:///(?P<path>.+)$")


class BackupError(RuntimeError):
    pass


def _sqlite_db_path(database_url: str) -> Path | None:
    """database_url'den (ör. 'sqlite:///./health_coach.db') gerçek dosya
    yolunu çıkarır; SQLite değilse None."""
    match = _SQLITE_URL_RE.match(database_url)
    if not match:
        return None
    return Path(match.group("path")).resolve()


def _timestamp() -> str:
    # Mikrosaniye: saniyede birden fazla yedek (testler) dosya adında çakışmasın.
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")


def backup_dir_for(database_url: str) -> Path:
    settings = get_settings()
    if settings.backup_dir:
        return Path(settings.backup_dir).resolve()
    sqlite_path = _sqlite_db_path(database_url)
    if sqlite_path is not None:
        return sqlite_path.parent / BACKUP_DIR_NAME
    return Path(BACKUP_DIR_NAME).resolve()


def backup_database() -> Path | None:
    """Veritabanının tutarlı bir yedeğini alır, `backup_max_to_keep`ten eski
    yerel yedekleri siler ve (ayarlıysa) pod dışına kopyalar. Yedeklenecek bir
    şey yoksa (SQLite dosyası yok, desteklenmeyen motor) None döner; pg_dump
    başarısızsa BackupError fırlatır - zamanlayıcı bunu ERROR olarak loglar ve
    /health/ready eski yedeği fark eder."""
    settings = get_settings()
    database_url = settings.database_url
    if database_url.startswith("postgresql"):
        backup_path = _backup_postgres(database_url)
    else:
        backup_path = _backup_sqlite(database_url)
    if backup_path is None:
        return None

    stem = backup_path.name.rsplit("_", 3)[0]
    _prune_old_backups(backup_path.parent, stem, backup_path.suffix, settings.backup_max_to_keep)
    logger.info("Veritabanı yedeği alındı: %s", backup_path)
    if settings.backup_rclone_remote:
        _copy_offsite(backup_path)
    return backup_path


def _backup_sqlite(database_url: str) -> Path | None:
    db_path = _sqlite_db_path(database_url)
    if db_path is None:
        logger.info("Yedekleme atlandı: desteklenmeyen veritabanı.")
        return None
    if not db_path.exists():
        logger.warning("Yedekleme atlandı: SQLite DB dosyası bulunamadı (%s)", database_url)
        return None

    backup_dir = backup_dir_for(database_url)
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{db_path.stem}_{_timestamp()}.db"

    source = sqlite3.connect(str(db_path))
    try:
        destination = sqlite3.connect(str(backup_path))
        try:
            source.backup(destination)
        finally:
            destination.close()
    finally:
        source.close()
    return backup_path


def pg_dump_command(database_url: str, output: Path) -> tuple[list[str], dict[str, str]]:
    """pg_dump argümanları + ortam değişkenleri. Parola komut satırına değil
    PGPASSWORD'e konur (komut satırı `ps` ile herkese görünür)."""
    url = make_url(database_url)
    args = [
        get_settings().pg_dump_path,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        f"--file={output}",
    ]
    if url.host:
        args.append(f"--host={url.host}")
    if url.port:
        args.append(f"--port={url.port}")
    if url.username:
        args.append(f"--username={url.username}")
    args.append(f"--dbname={url.database}")
    env = {**os.environ}
    if url.password:
        env["PGPASSWORD"] = str(url.password)
    return args, env


def _backup_postgres(database_url: str) -> Path:
    backup_dir = backup_dir_for(database_url)
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{POSTGRES_BACKUP_STEM}_{_timestamp()}.dump"
    # Önce geçici ada yazılır: yarıda kalan bir döküm "en yeni yedek" sayılıp
    # eski sağlam yedeklerin silinmesine yol açmasın.
    partial = backup_path.with_suffix(".dump.partial")
    args, env = pg_dump_command(database_url, partial)
    try:
        result = subprocess.run(args, env=env, capture_output=True, text=True, timeout=_PG_DUMP_TIMEOUT_S)
    except (OSError, subprocess.TimeoutExpired) as exc:
        partial.unlink(missing_ok=True)
        raise BackupError(f"pg_dump çalıştırılamadı: {exc}") from exc
    if result.returncode != 0:
        partial.unlink(missing_ok=True)
        raise BackupError(f"pg_dump başarısız (kod {result.returncode}): {result.stderr.strip()[:500]}")
    partial.replace(backup_path)
    return backup_path


def _copy_offsite(backup_path: Path) -> None:
    """Yedeği rclone remote'una kopyalar, remote'ta saklama süresini aşanları
    siler. Başarısızlık yerel yedeği etkilemez, yalnız ERROR loglanır."""
    settings = get_settings()
    remote = settings.backup_rclone_remote.rstrip("/")
    commands = [
        [settings.rclone_path, "copyto", str(backup_path), f"{remote}/{backup_path.name}"],
        [
            settings.rclone_path,
            "delete",
            remote,
            f"--min-age={settings.backup_remote_retention_days}d",
            f"--include={backup_path.name.rsplit('_', 3)[0]}_*{backup_path.suffix}",
        ],
    ]
    for args in commands:
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=_RCLONE_TIMEOUT_S)
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.error("Pod dışı yedek kopyası başarısız (%s): %s", args[1], exc)
            return
        if result.returncode != 0:
            logger.error("Pod dışı yedek kopyası başarısız (%s): %s", args[1], result.stderr.strip()[:500])
            return
    logger.info("Yedek pod dışına kopyalandı: %s", remote)


def latest_backup_time(database_url: str) -> datetime | None:
    """En yeni yerel yedeğin zamanı (UTC) - /health/ready yedeklerin durup
    durmadığını buna bakarak söyler."""
    backup_dir = backup_dir_for(database_url)
    if not backup_dir.is_dir():
        return None
    newest = max(
        (p for p in backup_dir.iterdir() if p.suffix in {".db", ".dump"} and p.is_file()),
        key=lambda p: p.stat().st_mtime,
        default=None,
    )
    if newest is None:
        return None
    return datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc)


def _prune_old_backups(backup_dir: Path, stem: str, suffix: str, max_to_keep: int) -> None:
    backups = sorted(backup_dir.glob(f"{stem}_*{suffix}"), key=lambda p: p.name, reverse=True)
    for old_backup in backups[max_to_keep:]:
        old_backup.unlink()
