"""Proaktif check-in ve bakım job fonksiyonları."""

import logging
from datetime import date as date_type
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from app.agents.motivation_agent import render_checkin_message, render_daily_nudge_message
from app.config import get_settings
from app.db.session import SessionLocal
from app.models.checkin_message import CheckinMessage
from app.models.rate_limit_attempt import RateLimitAttempt
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services.user_time import user_today, zone_for
from app.services import daily_nudge_service, photo_history_service

logger = logging.getLogger(__name__)

# APScheduler'ın gün kısaltmaları -> datetime.weekday() (Pazartesi=0).
_WEEKDAY_INDEX = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _active_user_ids(db: Session) -> list[int]:
    """Aktif kullanıcı = en az bir profil oluşturmuş kullanıcı."""
    return [row.user_id for row in db.query(UserProfile.user_id).all()]


def _profile_of(db: Session, user_id: int) -> UserProfile | None:
    return db.query(UserProfile).filter(UserProfile.user_id == user_id).first()


def _local_time(db: Session, user_id: int, now_utc: datetime) -> datetime:
    """Kullanıcının YEREL saati. Saat dilimi bilinmiyorsa UTC (bkz. user_time.zone_for)."""
    user = db.get(User, user_id)
    return now_utc.astimezone(zone_for(user.timezone if user is not None else None))


def weekly_summary_job(db: Session, now_utc: datetime | None = None) -> list[CheckinMessage]:
    """Her saat başı tetiklenir (bkz. scheduler.py). Kullanıcının YEREL günü
    yapılandırılmış güne (varsayılan Pazar) ve yerel saati `weekly_checkin_hour`a
    denk geldiği çalıştırmada haftalık check-in üretilir - kullanıcı başına haftada
    tek mesaj. `now_utc` yoksa (elle/test) gün/saat filtresi uygulanmaz.

    2026-10-05 (KVKK): sunucu artık bildirim (Expo push) ya da e-posta GÖNDERMİYOR.
    Mesaj uygulama içindeki Bildirimler ekranında; telefondaki hatırlatmayı cihaz
    kendisi, yerel bildirimle aynı gün daha geç bir saatte gösterir
    (mobile/lib/local-notifications.ts). Bu yüzden üretim saati sabit ve erken:
    LLM kuyruğu kaç kullanıcı olursa olsun bildirimden önce biter. Önceki "sohbet
    saatlerinden kişiye özel saat" tahmini yalnız push zamanlaması içindi, kaldırıldı."""
    settings = get_settings()
    weekday = _WEEKDAY_INDEX.get(settings.weekly_checkin_day_of_week, 6)

    created: list[CheckinMessage] = []
    for user_id in _active_user_ids(db):
        # Kullanıcı haftalık özeti kapattıysa (Profil > Hesap > Bildirimler,
        # 2026-09-25) mesaj üretilmez.
        profile = _profile_of(db, user_id)
        if profile is not None and not profile.weekly_summary_enabled:
            continue
        if now_utc is not None:
            local = _local_time(db, user_id, now_utc)
            if local.weekday() != weekday or local.hour != settings.weekly_checkin_hour:
                continue
        message_text = render_checkin_message(db, user_id)
        checkin = CheckinMessage(user_id=user_id, message=message_text, kind="weekly_summary")
        db.add(checkin)
        created.append(checkin)

    db.commit()
    for checkin in created:
        db.refresh(checkin)
    return created


def _is_nudge_hour(db: Session, user_id: int, profile: UserProfile | None, now_utc: datetime, default_hour: int) -> bool:
    """Kullanıcının YEREL saati, seçtiği (yoksa varsayılan) hatırlatma saatine
    denk geliyor mu."""
    local_hour = _local_time(db, user_id, now_utc).hour
    wanted = profile.daily_nudge_hour if profile is not None and profile.daily_nudge_hour is not None else default_hour
    return local_hour == wanted


def daily_nudge_job(
    db: Session, today: date_type | None = None, now_utc: datetime | None = None
) -> list[CheckinMessage]:
    """Günde bir kez tetiklenir (bkz. scheduler.py - sabit saat, haftalık
    job'un aksine kişiye-özel saat taraması YOK). Her aktif kullanıcı için:
    cooldown'daysa atla, sinyalleri topla, hiçbiri aktif değilse atla (boş
    "her şey harika" spam'i üretilmez), varsa LLM ile TEK birleşik mesaj
    üret, kaydet. Bildirim GÖNDERİLMEZ (2026-10-05): mesaj uygulama içinde,
    telefondaki hatırlatma cihazda yerel olarak zamanlanıyor."""
    settings = get_settings()

    created: list[CheckinMessage] = []
    for user_id in _active_user_ids(db):
        profile = _profile_of(db, user_id)
        if profile is not None and not profile.daily_nudge_enabled:
            continue
        # Zamanlayıcı her saat başı `now_utc` ile çağırır: yalnızca yerel saati
        # hatırlatma saatine denk gelen kullanıcılar işlenir (2026-09-25 - önceden
        # herkes sunucu saatiyle aynı anda). `now_utc` yoksa (elle/test) saat
        # filtresi uygulanmaz.
        if now_utc is not None and not _is_nudge_hour(db, user_id, profile, now_utc, settings.daily_nudge_hour):
            continue
        # Her kullanıcının KENDİ yerel günü (bkz. app/services/user_time.py).
        resolved_today = today or user_today(db, user_id)
        if daily_nudge_service.is_on_cooldown(db, user_id, resolved_today, settings.daily_nudge_cooldown_days):
            continue
        signals = daily_nudge_service.collect_signals(db, user_id, resolved_today)
        if not signals.any_active():
            continue
        message_text = render_daily_nudge_message(db, user_id, signals)
        checkin = CheckinMessage(user_id=user_id, message=message_text, kind="daily_nudge")
        db.add(checkin)
        db.commit()
        db.refresh(checkin)
        created.append(checkin)

    return created


def run_scheduled_daily_nudge() -> list[CheckinMessage]:
    """APScheduler tarafından cron ile çağrılan giriş noktası - kendi DB
    session'ını açar/kapatır (run_scheduled_weekly_summary ile aynı desen)."""
    db = SessionLocal()
    try:
        return daily_nudge_job(db, now_utc=datetime.now(timezone.utc))
    finally:
        db.close()


def run_scheduled_weekly_summary() -> list[CheckinMessage]:
    """APScheduler tarafından cron ile çağrılan giriş noktası: kendi DB session'ını
    açar/kapatır (job fonksiyonları request-scoped bir session almadığı için)."""
    db = SessionLocal()
    try:
        return weekly_summary_job(db, now_utc=datetime.now(timezone.utc))
    finally:
        db.close()


def cleanup_old_rate_limit_attempts_job(db: Session, retention_days: int) -> int:
    """`retention_days`'ten eski rate_limit_attempts satırlarını siler. Bu
    kayıtlar zaten sadece WINDOW_MINUTES (15dk) içindekiler sayaca dahil
    ediliyor (bkz. auth/rate_limit.py::is_locked_out) - daha eskisi hiçbir
    işlevsel etkisi olmadan tabloyu büyütmekten başka bir şey yapmıyor."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=retention_days)
    deleted = (
        db.query(RateLimitAttempt).filter(RateLimitAttempt.created_at < cutoff).delete()
    )
    db.commit()
    return deleted


def run_scheduled_rate_limit_cleanup() -> int:
    """APScheduler giriş noktası - kendi DB session'ını açar/kapatır."""
    db = SessionLocal()
    try:
        settings = get_settings()
        return cleanup_old_rate_limit_attempts_job(db, settings.rate_limit_attempt_retention_days)
    finally:
        db.close()


def run_scheduled_photo_retention_cleanup() -> int:
    """APScheduler giriş noktası - kendi DB session'ını açar/kapatır."""
    db = SessionLocal()
    try:
        settings = get_settings()
        return photo_history_service.cleanup_old_meal_photos(
            db, settings.meal_photo_retention_count, settings.meal_photo_retention_months
        )
    finally:
        db.close()
