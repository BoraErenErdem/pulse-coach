from datetime import datetime

import pytest
from apscheduler.triggers.cron import CronTrigger
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db.base import Base
from app.main import app as main_app
from app.models.user import User
from app.models.user_profile import UserProfile
from app.scheduler import jobs as jobs_module
from app.scheduler import scheduler as scheduler_module
from tests.db_utils import make_test_engine
from app.scheduler.scheduler import (
    DAILY_NUDGE_JOB_ID,
    DATABASE_BACKUP_JOB_ID,
    PHOTO_RETENTION_CLEANUP_JOB_ID,
    RATE_LIMIT_CLEANUP_JOB_ID,
    WEEKLY_SUMMARY_JOB_ID,
    shutdown_scheduler,
    start_scheduler,
)


def test_start_scheduler_registers_weekly_job():
    scheduler = start_scheduler()
    assert scheduler is not None
    try:
        job = scheduler.get_job(WEEKLY_SUMMARY_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        assert fields["day_of_week"] == "sun"
        # Saat "*" - her saat başı tetiklenir, hangi kullanıcıya check-in
        # gönderileceğine jobs.py::weekly_summary_job kullanıcı bazında karar
        # verir (bkz. jobs.py::_preferred_checkin_hour).
        assert fields["hour"] == "*"
        assert fields["minute"] == "0"
    finally:
        shutdown_scheduler()


def test_start_scheduler_registers_daily_nudge_job():
    scheduler = start_scheduler()
    assert scheduler is not None
    try:
        job = scheduler.get_job(DAILY_NUDGE_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        # Her saat başı çalışır; kullanıcıya göre saat filtresi job'un içinde
        # (yerel saat + seçilen hatırlatma saati, 2026-09-25).
        assert fields["hour"] == "*"
        assert fields["minute"] == str(get_settings().daily_nudge_minute)
    finally:
        shutdown_scheduler()


def test_start_scheduler_registers_backup_job():
    scheduler = start_scheduler()
    assert scheduler is not None
    try:
        job = scheduler.get_job(DATABASE_BACKUP_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        assert fields["hour"] == str(get_settings().backup_hour)
        assert fields["minute"] == "0"
    finally:
        shutdown_scheduler()


def test_start_scheduler_registers_rate_limit_cleanup_job():
    scheduler = start_scheduler()
    assert scheduler is not None
    try:
        job = scheduler.get_job(RATE_LIMIT_CLEANUP_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        assert fields["hour"] == str(get_settings().backup_hour)
        assert fields["minute"] == "30"
    finally:
        shutdown_scheduler()


def test_start_scheduler_registers_photo_retention_cleanup_job():
    scheduler = start_scheduler()
    assert scheduler is not None
    try:
        job = scheduler.get_job(PHOTO_RETENTION_CLEANUP_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        assert fields["hour"] == str(get_settings().backup_hour)
        assert fields["minute"] == "45"
    finally:
        shutdown_scheduler()


def test_start_scheduler_is_idempotent():
    first = start_scheduler()
    second = start_scheduler()
    assert first is not None and second is not None
    try:
        assert first is second
    finally:
        shutdown_scheduler()


def test_shutdown_scheduler_stops_running_instance():
    scheduler = start_scheduler()
    assert scheduler is not None
    assert scheduler.running
    shutdown_scheduler()
    assert not scheduler.running


@pytest.mark.integration
def test_run_scheduled_weekly_summary_opens_and_closes_own_session(monkeypatch):
    # weekly_summary_job artık gerçek check-in e-postası göndermeye çalışıyor
    # - bu makinede .env'de gerçek Gmail SMTP kimlik bilgileri var, testte
    # gerçek bir gönderim tetiklenmesin diye sahte bir fonksiyonla değiştiriliyor.
    monkeypatch.setattr(jobs_module.email_service, "send_checkin_email", lambda *args, **kwargs: None)
    engine = make_test_engine()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    user = User(email="scheduler@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    session.close()

    monkeypatch.setattr(jobs_module, "SessionLocal", TestingSessionLocal)
    # Kullanıcının sohbet geçmişi yok, bu yüzden yedek/varsayılan saate düşer
    # (bkz. _preferred_checkin_hour) - testin gerçek saatten bağımsız,
    # deterministik olması için varsayılanı "şimdi"ye eşitliyoruz.
    monkeypatch.setattr(get_settings(), "weekly_checkin_hour", datetime.now().hour)

    created = jobs_module.run_scheduled_weekly_summary()

    assert len(created) == 1
    assert created[0].user_id == user_id


def _make_test_db():
    engine = make_test_engine()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal


def test_daily_nudge_job_creates_no_row_when_no_signals_active(monkeypatch):
    from datetime import date

    TestingSessionLocal = _make_test_db()
    session = TestingSessionLocal()
    user = User(email="nudge-none@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    # Sinyallerin hiçbiri aktif olmasın diye bugünkü mod kaydı ekleniyor.
    from app.models.mood_log import MoodLog

    today = date(2026, 8, 10)  # bir Pazartesi - hafta sonuna yaklaşılmıyor
    session.add(MoodLog(user_id=user_id, mood_key="iyi", log_date=today))
    session.commit()
    session.close()

    monkeypatch.setattr(jobs_module, "SessionLocal", TestingSessionLocal)

    created = jobs_module.daily_nudge_job(TestingSessionLocal(), today=today)

    assert created == []


@pytest.mark.integration
def test_daily_nudge_job_creates_row_and_attempts_push_when_signal_active(monkeypatch):
    from datetime import date

    TestingSessionLocal = _make_test_db()
    session = TestingSessionLocal()
    user = User(email="nudge-active@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    session.close()

    monkeypatch.setattr(
        jobs_module, "render_daily_nudge_message", lambda db, uid, signals: "Test hatırlatma mesajı"
    )

    today = date(2026, 8, 10)
    created = jobs_module.daily_nudge_job(TestingSessionLocal(), today=today)

    assert len(created) == 1
    assert created[0].user_id == user_id
    assert created[0].kind == "daily_nudge"
    assert created[0].message == "Test hatırlatma mesajı"


@pytest.mark.integration
def test_daily_nudge_job_respects_cooldown(monkeypatch):
    from datetime import date, timedelta

    from app.models.checkin_message import CheckinMessage

    TestingSessionLocal = _make_test_db()
    session = TestingSessionLocal()
    user = User(email="nudge-cooldown@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    today = date(2026, 8, 10)
    session.add(
        CheckinMessage(
            user_id=user_id, kind="daily_nudge", message="dün gönderildi", generated_at=today - timedelta(days=1)
        )
    )
    session.commit()
    session.close()

    monkeypatch.setattr(
        jobs_module, "render_daily_nudge_message", lambda db, uid, signals: "Test hatırlatma mesajı"
    )

    created = jobs_module.daily_nudge_job(TestingSessionLocal(), today=today)

    assert created == []


def test_lifespan_starts_scheduler_when_enabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "scheduler_enabled", True)
    scheduler_module._scheduler = None
    with TestClient(main_app):
        assert scheduler_module._scheduler is not None
        assert scheduler_module._scheduler.running
    assert scheduler_module._scheduler is None


def test_lifespan_skips_scheduler_when_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "scheduler_enabled", False)
    scheduler_module._scheduler = None
    with TestClient(main_app):
        assert scheduler_module._scheduler is None


def _user_with_profile(TestingSessionLocal, email, **profile_fields):
    session = TestingSessionLocal()
    user = User(email=email, hashed_password="x", timezone=profile_fields.pop("timezone", None))
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.add(UserProfile(user_id=user_id, goal="general_health", **profile_fields))
    session.commit()
    session.close()
    return user_id


# Profil sekmesi turu (2026-09-25): bildirim tercihleri + yerel hatırlatma saati.
def test_daily_nudge_job_skips_user_who_disabled_reminders(monkeypatch):
    from datetime import date

    TestingSessionLocal = _make_test_db()
    _user_with_profile(TestingSessionLocal, "nudge-off@example.com", daily_nudge_enabled=False)
    monkeypatch.setattr(jobs_module, "render_daily_nudge_message", lambda db, uid, signals: "mesaj")

    assert jobs_module.daily_nudge_job(TestingSessionLocal(), today=date(2026, 8, 10)) == []


def test_daily_nudge_job_uses_users_local_reminder_hour(monkeypatch):
    from datetime import date, timezone as dt_timezone

    TestingSessionLocal = _make_test_db()
    user_id = _user_with_profile(
        TestingSessionLocal, "nudge-hour@example.com", daily_nudge_hour=9, timezone="Europe/Istanbul"
    )
    monkeypatch.setattr(jobs_module, "render_daily_nudge_message", lambda db, uid, signals: "mesaj")
    monkeypatch.setattr(jobs_module.push_service, "send_push_notification", lambda *a, **k: None)
    today = date(2026, 8, 10)

    # 05:00 UTC = 08:00 İstanbul -> saat değil.
    early = datetime(2026, 8, 10, 5, 0, tzinfo=dt_timezone.utc)
    assert jobs_module.daily_nudge_job(TestingSessionLocal(), today=today, now_utc=early) == []

    # 06:00 UTC = 09:00 İstanbul -> kullanıcının seçtiği saat.
    on_time = datetime(2026, 8, 10, 6, 0, tzinfo=dt_timezone.utc)
    created = jobs_module.daily_nudge_job(TestingSessionLocal(), today=today, now_utc=on_time)
    assert [c.user_id for c in created] == [user_id]


def test_daily_nudge_job_falls_back_to_default_hour(monkeypatch):
    from datetime import date, timezone as dt_timezone

    TestingSessionLocal = _make_test_db()
    _user_with_profile(TestingSessionLocal, "nudge-default@example.com")  # saat dilimi yok -> UTC
    monkeypatch.setattr(jobs_module, "render_daily_nudge_message", lambda db, uid, signals: "mesaj")
    monkeypatch.setattr(jobs_module.push_service, "send_push_notification", lambda *a, **k: None)
    default_hour = get_settings().daily_nudge_hour
    now = datetime(2026, 8, 10, default_hour, 0, tzinfo=dt_timezone.utc)

    assert len(jobs_module.daily_nudge_job(TestingSessionLocal(), today=date(2026, 8, 10), now_utc=now)) == 1


def test_weekly_summary_job_skips_user_who_disabled_summary(monkeypatch):
    TestingSessionLocal = _make_test_db()
    _user_with_profile(TestingSessionLocal, "weekly-off@example.com", weekly_summary_enabled=False)
    monkeypatch.setattr(jobs_module, "render_checkin_message", lambda db, uid: "özet")

    created = jobs_module.weekly_summary_job(TestingSessionLocal(), current_hour=get_settings().weekly_checkin_hour)
    assert created == []
