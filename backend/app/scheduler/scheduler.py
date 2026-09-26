"""APScheduler kaydı: haftalık check-in job'ını cron ile zamanlar.

Gün config'den okunur (app.config.Settings) — varsayılan her Pazar. Job SAAT
BAZINDA (her saat başı) tetiklenir; hangi kullanıcıya o çalıştırmada check-in
gönderileceğine jobs.py::weekly_summary_job kendi içinde, kullanıcının tahmini
aktif saatine göre karar verir (bkz. jobs.py::_preferred_checkin_hour) - böylece
kullanıcı başına haftada tek mesaj, ama sabit bir saat yerine kişiye göre esnek
bir saatte gönderilir. weekly_checkin_hour artık "varsayılan/yedek saat" anlamına
geliyor (yeterli sohbet geçmişi olmayan kullanıcılar için).
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.scheduler.jobs import (
    run_scheduled_daily_nudge,
    run_scheduled_photo_retention_cleanup,
    run_scheduled_rate_limit_cleanup,
    run_scheduled_weekly_summary,
)
from app.services.backup_service import backup_database

logger = logging.getLogger(__name__)

WEEKLY_SUMMARY_JOB_ID = "weekly_summary_job"
DAILY_NUDGE_JOB_ID = "daily_nudge_job"
DATABASE_BACKUP_JOB_ID = "database_backup_job"
RATE_LIMIT_CLEANUP_JOB_ID = "rate_limit_cleanup_job"
PHOTO_RETENTION_CLEANUP_JOB_ID = "photo_retention_cleanup_job"

_scheduler: BackgroundScheduler | None = None

# Postgres'te (2026-09-26) zamanlayıcıyı aynı anda YALNIZCA bir süreç çalıştırır:
# birden fazla uvicorn worker'ı ya da yanlışlıkla iki worker süreci açılsa bile
# hatırlatmalar/özetler çift gitmez. Kilit, süreç boyunca açık tutulan ayrı bir
# bağlantıda; süreç ölünce Postgres kilidi kendiliğinden bırakır.
_LEADER_LOCK_KEY = 7_302_514_027
_leader_connection: Connection | None = None


def _acquire_leader_lock() -> bool:
    global _leader_connection
    from app.db.session import engine

    if engine.dialect.name != "postgresql":
        return True  # SQLite tek süreçte çalışır
    if _leader_connection is not None:
        return True
    connection = engine.connect()
    acquired = connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": _LEADER_LOCK_KEY}).scalar()
    connection.commit()
    if not acquired:
        connection.close()
        return False
    _leader_connection = connection
    return True


def _release_leader_lock() -> None:
    global _leader_connection
    if _leader_connection is not None:
        _leader_connection.close()
        _leader_connection = None


def start_scheduler() -> BackgroundScheduler | None:
    """Scheduler'ı başlatır ve haftalık check-in job'ını kaydeder. Zaten çalışıyorsa
    mevcut instance'ı döndürür (idempotent). Postgres'te başka bir süreç zaten
    lider ise hiçbir şey yapmadan None döner."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    if not _acquire_leader_lock():
        logger.info("Scheduler başlatılmadı: başka bir süreç zaten çalıştırıyor (Postgres lider kilidi).")
        return None

    settings = get_settings()
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        run_scheduled_weekly_summary,
        trigger=CronTrigger(
            day_of_week=settings.weekly_checkin_day_of_week,
            hour="*",
            minute=settings.weekly_checkin_minute,
        ),
        id=WEEKLY_SUMMARY_JOB_ID,
        replace_existing=True,
    )
    # Günlük koşullu hatırlatma - haftalık job'un aksine SABİT saat (kişiye-
    # özel saat taraması yok, bkz. jobs.py::daily_nudge_job docstring'i).
    _scheduler.add_job(
        run_scheduled_daily_nudge,
        # Her saat başı: jobs.py::daily_nudge_job kullanıcının YEREL saatine ve
        # seçtiği hatırlatma saatine göre kimin işleneceğine karar verir
        # (2026-09-25); cooldown günde birden fazla mesajı zaten engelliyor.
        trigger=CronTrigger(hour="*", minute=settings.daily_nudge_minute),
        id=DAILY_NUDGE_JOB_ID,
        replace_existing=True,
    )
    _scheduler.add_job(
        backup_database,
        trigger=CronTrigger(hour=settings.backup_hour, minute=0),
        id=DATABASE_BACKUP_JOB_ID,
        replace_existing=True,
    )
    # Backup'tan 30dk sonra, aynı düşük kullanım saatinde - eski rate-limit
    # kayıtlarını temizler.
    _scheduler.add_job(
        run_scheduled_rate_limit_cleanup,
        trigger=CronTrigger(hour=settings.backup_hour, minute=30),
        id=RATE_LIMIT_CLEANUP_JOB_ID,
        replace_existing=True,
    )
    # 15dk daha sonra - kullanıcı başına retention sınırını (foto sayısı/ay)
    # aşan meal_photos kayıtlarını temizler (bkz. photo_history_service.py).
    _scheduler.add_job(
        run_scheduled_photo_retention_cleanup,
        trigger=CronTrigger(hour=settings.backup_hour, minute=45),
        id=PHOTO_RETENTION_CLEANUP_JOB_ID,
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started: %s scheduled hourly on day_of_week=%s (minute=%02d), "
        "varsayılan/yedek saat=%02d (kullanıcı başına kişiselleştirilmiş saat "
        "önceliklidir, bkz. jobs.py::_preferred_checkin_hour); %s scheduled daily at %02d:%02d; "
        "%s scheduled daily at %02d:00; %s scheduled daily at %02d:30; %s scheduled daily at %02d:45",
        WEEKLY_SUMMARY_JOB_ID,
        settings.weekly_checkin_day_of_week,
        settings.weekly_checkin_minute,
        settings.weekly_checkin_hour,
        DAILY_NUDGE_JOB_ID,
        settings.daily_nudge_hour,
        settings.daily_nudge_minute,
        DATABASE_BACKUP_JOB_ID,
        settings.backup_hour,
        RATE_LIMIT_CLEANUP_JOB_ID,
        settings.backup_hour,
        PHOTO_RETENTION_CLEANUP_JOB_ID,
        settings.backup_hour,
    )
    return _scheduler


def shutdown_scheduler() -> None:
    """Scheduler çalışıyorsa durdurur. Test/isolation için de kullanılabilir."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
    _release_leader_lock()
