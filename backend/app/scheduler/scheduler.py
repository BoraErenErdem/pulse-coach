"""APScheduler kaydı: check-in, hatırlatma ve bakım job'larını cron ile zamanlar.

Haftalık check-in job'ı HER SAAT başı tetiklenir; kimin için o çalıştırmada mesaj
üretileceğine jobs.py::weekly_summary_job kullanıcının YEREL gün/saatine
(weekly_checkin_day_of_week + weekly_checkin_hour) bakarak karar verir - farklı
saat dilimlerindeki kullanıcılar için sunucu gününe bağlı kalmamak için her gün.
"""

import logging
from datetime import datetime, timedelta, timezone

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
from app.services.backup_service import backup_database, latest_backup_time

logger = logging.getLogger(__name__)

WEEKLY_SUMMARY_JOB_ID = "weekly_summary_job"
DAILY_NUDGE_JOB_ID = "daily_nudge_job"
DATABASE_BACKUP_JOB_ID = "database_backup_job"
DATABASE_BACKUP_CATCH_UP_JOB_ID = "database_backup_catch_up_job"
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


def backup_missed(now: datetime, latest_backup: datetime | None, backup_hour: int) -> bool:
    """Son planlanmış gece yedeği (bugün ya da dün backup_hour:00 UTC) alınmamış mı?"""
    last_due = now.replace(hour=backup_hour, minute=0, second=0, microsecond=0)
    if last_due > now:
        last_due -= timedelta(days=1)
    return latest_backup is None or latest_backup < last_due


def _schedule_backup_catch_up(scheduler: BackgroundScheduler) -> None:
    """Zamanlayıcı bellek içi: kapalıyken kaçan gece yedeğini açılınca bilmez.
    2026-11-05'te sunucu gece askıya alınınca yedek kaçtı ve /health/ready 36
    saat sonra 503 döndü. Kaçan yedek varsa açılışta bir kez hemen alınır.
    Yalnız yedek tazeliği izlenirken (HEALTH_MAX_BACKUP_AGE_HOURS > 0, canlı)
    açık: geliştirmede ve testlerde her açılış yedek almasın."""
    settings = get_settings()
    if settings.health_max_backup_age_hours <= 0:
        return
    latest = latest_backup_time(settings.database_url)
    if not backup_missed(datetime.now(timezone.utc), latest, settings.backup_hour):
        return
    logger.warning("Kaçan gece yedeği var (en yeni: %s) - telafi yedeği hemen alınıyor.", latest)
    # Tetikleyicisiz iş, zamanlayıcı başlar başlamaz bir kez çalışır (açılışı bekletmez).
    scheduler.add_job(backup_database, id=DATABASE_BACKUP_CATCH_UP_JOB_ID, replace_existing=True)


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
        trigger=CronTrigger(hour="*", minute=settings.weekly_checkin_minute),
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
    _schedule_backup_catch_up(_scheduler)
    _scheduler.start()
    logger.info(
        "Scheduler started: %s scheduled hourly (kullanıcının yerel günü=%s, "
        "dakika=%02d, yerel saat=%02d); %s scheduled daily at %02d:%02d; "
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
