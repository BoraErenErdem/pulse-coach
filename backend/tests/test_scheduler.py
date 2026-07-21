import pytest
from apscheduler.triggers.cron import CronTrigger
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db.base import Base
from app.main import app as main_app
from app.models.user import User
from app.models.user_profile import UserProfile
from app.scheduler import jobs as jobs_module
from app.scheduler import scheduler as scheduler_module
from app.scheduler.scheduler import WEEKLY_SUMMARY_JOB_ID, shutdown_scheduler, start_scheduler


def test_start_scheduler_registers_weekly_job():
    scheduler = start_scheduler()
    try:
        job = scheduler.get_job(WEEKLY_SUMMARY_JOB_ID)
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {field.name: str(field) for field in job.trigger.fields}
        assert fields["day_of_week"] == "sun"
        assert fields["hour"] == "20"
        assert fields["minute"] == "0"
    finally:
        shutdown_scheduler()


def test_start_scheduler_is_idempotent():
    first = start_scheduler()
    second = start_scheduler()
    try:
        assert first is second
    finally:
        shutdown_scheduler()


def test_shutdown_scheduler_stops_running_instance():
    scheduler = start_scheduler()
    assert scheduler.running
    shutdown_scheduler()
    assert not scheduler.running


@pytest.mark.integration
def test_run_scheduled_weekly_summary_opens_and_closes_own_session(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
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

    created = jobs_module.run_scheduled_weekly_summary()

    assert len(created) == 1
    assert created[0].user_id == user_id


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
