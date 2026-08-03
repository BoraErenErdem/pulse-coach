"""Proaktif check-in job fonksiyonları."""

from datetime import datetime

from sqlalchemy.orm import Session
from app.agents.motivation_agent import render_checkin_message
from app.config import get_settings
from app.db.session import SessionLocal
from app.models.checkin_message import CheckinMessage
from app.models.conversation import Conversation
from app.models.user_profile import UserProfile

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
    return created


def run_scheduled_weekly_summary() -> list[CheckinMessage]:
    """APScheduler tarafından cron ile çağrılan giriş noktası: kendi DB session'ını
    açar/kapatır (job fonksiyonları request-scoped bir session almadığı için)."""
    db = SessionLocal()
    try:
        return weekly_summary_job(db)
    finally:
        db.close()
