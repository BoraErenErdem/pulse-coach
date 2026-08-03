import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from app.config import get_settings

logger = logging.getLogger(__name__)

BACKUP_DIR_NAME = "backups"

_SQLITE_URL_RE = re.compile(r"^sqlite:///(?P<path>.+)$")


def _sqlite_db_path(database_url: str) -> Path | None:
    """database_url'den (ör. 'sqlite:///./health_coach.db') gerçek dosya
    yolunu çıkarır. SQLite dışı bir DB (ör. ileride Postgres) kullanılıyorsa
    None döner - bu backup mekanizması sadece SQLite dosyaları için, Postgres
    kendi native yedekleme araçlarına (pg_dump vb.) sahip."""
    match = _SQLITE_URL_RE.match(database_url)
    if not match:
        return None
    return Path(match.group("path")).resolve()


def backup_database() -> Path | None:
    """Çalışan SQLite veritabanının tutarlı bir anlık görüntüsünü alır ve
    `backups/` klasörüne kaydeder, ardından `backup_max_to_keep`'ten fazla
    olan en eski yedekleri siler. Dosyayı elle kopyalamak (shutil.copy)
    YERİNE sqlite3'ün kendi online backup API'si kullanılıyor - bu, aktif
    yazma/transaction sırasında bile tutarlı bir kopya garantiliyor (ham
    dosya kopyalama aynı anda yazma olursa bozuk bir anlık görüntü alabilir).
    SQLite kullanılmıyorsa (database_url başka bir motora işaret ediyorsa)
    veya DB dosyası henüz yoksa None döner, hiçbir şey yapmaz."""
    settings = get_settings()
    db_path = _sqlite_db_path(settings.database_url)
    if db_path is None or not db_path.exists():
        logger.warning("Yedekleme atlandı: SQLite DB dosyası bulunamadı (%s)", settings.database_url)
        return None

    backup_dir = db_path.parent / BACKUP_DIR_NAME
    backup_dir.mkdir(exist_ok=True)

    # Mikrosaniye çözünürlüğü - saniyede birden fazla yedek alınırsa (ör.
    # testlerde) dosya adı çakışmasını önlüyor.
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    backup_path = backup_dir / f"{db_path.stem}_{timestamp}.db"

    source = sqlite3.connect(str(db_path))
    try:
        destination = sqlite3.connect(str(backup_path))
        try:
            source.backup(destination)
        finally:
            destination.close()
    finally:
        source.close()

    _prune_old_backups(backup_dir, db_path.stem, settings.backup_max_to_keep)
    logger.info("Veritabanı yedeği alındı: %s", backup_path)
    return backup_path


def _prune_old_backups(backup_dir: Path, stem: str, max_to_keep: int) -> None:
    backups = sorted(backup_dir.glob(f"{stem}_*.db"), key=lambda p: p.name, reverse=True)
    for old_backup in backups[max_to_keep:]:
        old_backup.unlink()
