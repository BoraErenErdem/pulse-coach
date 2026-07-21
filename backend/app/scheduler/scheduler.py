"""APScheduler kaydı: haftalık check-in job'ını cron ile zamanlar.

Zamanlama config'den okunur (app.config.Settings) — varsayılan her Pazar 20:00.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.scheduler.jobs import run_scheduled_weekly_summary

logger = logging.getLogger(__name__)

WEEKLY_SUMMARY_JOB_ID = "weekly_summary_job"

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> BackgroundScheduler:
    """Scheduler'ı başlatır ve haftalık check-in job'ını kaydeder. Zaten çalışıyorsa
    mevcut instance'ı döndürür (idempotent)."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    settings = get_settings()
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        run_scheduled_weekly_summary,
        trigger=CronTrigger(
            day_of_week=settings.weekly_checkin_day_of_week,
            hour=settings.weekly_checkin_hour,
            minute=settings.weekly_checkin_minute,
        ),
        id=WEEKLY_SUMMARY_JOB_ID,
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started: %s scheduled for day_of_week=%s hour=%02d minute=%02d",
        WEEKLY_SUMMARY_JOB_ID,
        settings.weekly_checkin_day_of_week,
        settings.weekly_checkin_hour,
        settings.weekly_checkin_minute,
    )
    return _scheduler


def shutdown_scheduler() -> None:
    """Scheduler çalışıyorsa durdurur. Test/isolation için de kullanılabilir."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
