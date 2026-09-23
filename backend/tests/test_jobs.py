from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.meal_photo import MealPhoto
from app.models.rate_limit_attempt import RateLimitAttempt
from app.models.user import User
from app.scheduler import jobs as jobs_module


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _add_attempt(session, days_ago: float, bucket: str = "login", identifier: str = "user@example.com"):
    attempt = RateLimitAttempt(bucket=bucket, identifier=identifier)
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    attempt.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago)
    session.commit()
    return attempt


def test_cleanup_deletes_only_attempts_older_than_retention(db_session):
    _add_attempt(db_session, days_ago=10)
    recent = _add_attempt(db_session, days_ago=1)

    deleted_count = jobs_module.cleanup_old_rate_limit_attempts_job(db_session, retention_days=7)

    assert deleted_count == 1
    remaining = db_session.query(RateLimitAttempt).all()
    assert [row.id for row in remaining] == [recent.id]


def test_cleanup_does_nothing_when_no_old_attempts(db_session):
    _add_attempt(db_session, days_ago=1)

    deleted_count = jobs_module.cleanup_old_rate_limit_attempts_job(db_session, retention_days=7)

    assert deleted_count == 0
    assert db_session.query(RateLimitAttempt).count() == 1


def test_run_scheduled_rate_limit_cleanup_opens_and_closes_own_session(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    _add_attempt(session, days_ago=10)
    session.close()

    monkeypatch.setattr(jobs_module, "SessionLocal", TestingSessionLocal)

    deleted_count = jobs_module.run_scheduled_rate_limit_cleanup()

    assert deleted_count == 1


def test_run_scheduled_photo_retention_cleanup_opens_and_closes_own_session(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    user = User(email="photo-retention-job@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    photo = MealPhoto(user_id=user.id, image_data=b"x", mime_type="image/jpeg", detected_items_summary="")
    session.add(photo)
    session.commit()
    session.refresh(photo)
    photo.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=400)
    session.commit()
    session.close()

    monkeypatch.setattr(jobs_module, "SessionLocal", TestingSessionLocal)

    deleted_count = jobs_module.run_scheduled_photo_retention_cleanup()

    assert deleted_count == 1


def _add_user_messages_at_hours(session, hours):
    from app.models.conversation import Conversation

    user = User(email="hours@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    for hour in hours:
        session.add(
            Conversation(
                user_id=user.id, role="user", content="m", timestamp=datetime(2026, 1, 1, hour, 0).astimezone().astimezone(timezone.utc)
            )
        )
    session.commit()
    return user.id


def test_preferred_checkin_hour_wraps_around_midnight(db_session):
    # 23:00 ve 01:00 civarı sohbet eden bir kullanıcının aktif saati gece
    # yarısıdır - düz aritmetik ortalama bunu öğlen 12 olarak hesaplıyordu.
    user_id = _add_user_messages_at_hours(db_session, [23, 23, 0, 1, 1])
    assert jobs_module._preferred_checkin_hour(db_session, user_id, default_hour=20) == 0


def test_preferred_checkin_hour_plain_average_unchanged(db_session):
    user_id = _add_user_messages_at_hours(db_session, [8, 9, 9, 10, 9])
    assert jobs_module._preferred_checkin_hour(db_session, user_id, default_hour=20) == 9


@pytest.mark.parametrize("hours", [[8, 20] * 3, [6, 18] * 3])
def test_preferred_checkin_hour_falls_back_when_hours_cancel_out(db_session, hours):
    # Sabah+akşam eşit sohbet eden kullanıcıda belirgin bir aktif saat yok -
    # dairesel ortalama gürültüden anlamsız bir saat (gece 1) üretiyordu.
    user_id = _add_user_messages_at_hours(db_session, hours)
    assert jobs_module._preferred_checkin_hour(db_session, user_id, default_hour=20) == 20
