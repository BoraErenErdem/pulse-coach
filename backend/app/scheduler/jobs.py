"""Proaktif check-in ve bakım job fonksiyonları."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from app.agents.motivation_agent import render_checkin_message
from app.config import get_settings
from app.db.session import SessionLocal
from app.models.checkin_message import CheckinMessage
from app.models.conversation import Conversation
from app.models.rate_limit_attempt import RateLimitAttempt
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import email_service, photo_history_service

logger = logging.getLogger(__name__)

# Bir kullanıcının "aktif olduğu saat"i tahmin edebilmek için en az bu kadar
# kullanıcı mesajı gerekir - az veriyle ortalama almak (ör. tek bir gece yarısı
# mesajından "saat 2'de check-in gönder" sonucu çıkarmak) anlamsız/gürültülü
# olurdu, bu durumda config'deki sabit varsayılan saate düşülür.
MIN_MESSAGES_FOR_HOUR_PERSONALIZATION = 5


def _active_user_ids(db: Session) -> list[int]:
    """Aktif kullanıcı = en az bir profil oluşturmuş kullanıcı."""
    return [row.user_id for row in db.query(UserProfile.user_id).all()]


def _preferred_checkin_hour(db: Session, user_id: int, default_hour: int) -> int:
    """Kullanıcının kendi gönderdiği sohbet mesajlarının (Conversation.timestamp,
    role='user') saatlerinin ortalamasına dayalı basit bir heuristikle "aktif
    olduğu saat"i tahmin eder - rakip uygulama analizinden gelen "sabit saat
    yerine davranışa duyarlı check-in zamanlaması" önerisi. Yeterli veri yoksa
    config'deki sabit varsayılan saate döner."""
    hours = [
        row.timestamp.hour
        for row in db.query(Conversation.timestamp)
        .filter(Conversation.user_id == user_id, Conversation.role == "user")
        .all()
    ]
    if len(hours) < MIN_MESSAGES_FOR_HOUR_PERSONALIZATION:
        return default_hour
    return round(sum(hours) / len(hours)) % 24


def weekly_summary_job(db: Session, current_hour: int | None = None) -> list[CheckinMessage]:
    """Haftada bir kez, yapılandırılmış güne denk gelen HER saatte tetiklenmesi
    için tasarlanmıştır (bkz. scheduler.py - saat "*" olarak kayıtlı). Her aktif
    kullanıcı için o kullanıcının kendi tahmini aktif saatine denk gelen
    çalıştırmada bir check-in üretilir, diğer saatlerdeki çalıştırmalarda o
    kullanıcı atlanır - böylece kullanıcı başına haftada tek bir mesaj, ama
    sabit "her Pazar 20:00" yerine kişiye göre esnek bir saatte gönderilir."""
    settings = get_settings()
    hour = current_hour if current_hour is not None else datetime.now().hour

    created: list[CheckinMessage] = []
    for user_id in _active_user_ids(db):
        if _preferred_checkin_hour(db, user_id, settings.weekly_checkin_hour) != hour:
            continue
        message_text = render_checkin_message(db, user_id)
        checkin = CheckinMessage(user_id=user_id, message=message_text)
        db.add(checkin)
        created.append(checkin)

    db.commit()
    for checkin in created:
        db.refresh(checkin)

    for checkin in created:
        user = db.get(User, checkin.user_id)
        if user is None:
            continue
        try:
            email_service.send_checkin_email(user.email, checkin.message)
        except Exception:
            # Bir kullanıcının e-postası gönderilemese bile (ör. SMTP geçici
            # sorunu) diğer kullanıcıların check-in'i etkilenmemeli - mesaj
            # zaten checkin_messages tablosuna kaydedildi, uygulama içinden
            # hâlâ görülebilir.
            logger.exception("Check-in e-postası gönderilemedi (user_id=%s)", checkin.user_id)

    return created


def run_scheduled_weekly_summary() -> list[CheckinMessage]:
    """APScheduler tarafından cron ile çağrılan giriş noktası: kendi DB session'ını
    açar/kapatır (job fonksiyonları request-scoped bir session almadığı için)."""
    db = SessionLocal()
    try:
        return weekly_summary_job(db)
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
