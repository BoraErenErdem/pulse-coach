"""Proaktif check-in job fonksiyonları."""

from sqlalchemy.orm import Session
from app.agents.motivation_agent import render_checkin_message
from app.db.session import SessionLocal
from app.models.checkin_message import CheckinMessage
from app.models.user_profile import UserProfile


def _active_user_ids(db: Session) -> list[int]:
    """Aktif kullanıcı = en az bir profil oluşturmuş kullanıcı."""
    return [row.user_id for row in db.query(UserProfile.user_id).all()]


def weekly_summary_job(db: Session) -> list[CheckinMessage]:
    """Her Pazar 20:00 için tasarlanmıştır: aktif kullanıcıların son 7 günlük özetini
    Motivasyon Agent ile sıcak bir check-in mesajına çevirir ve checkin_messages
    tablosuna kaydeder."""
    created: list[CheckinMessage] = []
    for user_id in _active_user_ids(db):
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
