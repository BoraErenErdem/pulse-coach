"""Günlük adım (2026-11-06): Apple Sağlık eşitlemesi, ayrı açık rıza (KVKK 2.1), kalori tahmini, koç aracı."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.tracking_agent import build_tracking_tools
from app.db.base import Base
from app.exceptions import AppValidationError
from app.models.daily_steps import DailySteps
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import progress_service, step_service
from app.services.limits import MAX_DAILY_STEPS, MAX_STEP_SYNC_DAYS
from app.services.user_time import user_today
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="steps-unit@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    # Eşitleme rıza ister; birim testler rızalı kullanıcıyla başlar (rızasız durum ayrıca test ediliyor).
    step_service.give_steps_consent(session, user.id)
    try:
        yield session, user.id
    finally:
        session.close()


# --- kalori tahmini ---


def test_estimate_uses_height_based_stride_and_acsm_net_cost():
    # 175 cm erkek: adım 0.726 m -> 10.000 adım 7.26 km; 0.5 x 70 x 7.26 = 254.
    assert step_service.estimate_step_calories(10_000, 70, 175, "male") == 254


def test_estimate_without_weight_is_none_and_without_height_uses_default_stride():
    assert step_service.estimate_step_calories(10_000, None, 175, "male") is None
    # 0.70 m varsayılan adım -> 7.0 km -> 0.5 x 80 x 7 = 280.
    assert step_service.estimate_step_calories(10_000, 80, None, None) == 280


def test_estimate_zero_steps_is_zero():
    assert step_service.estimate_step_calories(0, 70, 175, "female") == 0


# --- eşitleme ---


def test_sync_inserts_then_updates_same_day(db_session):
    session, user_id = db_session
    today = user_today(session, user_id)
    assert step_service.sync_steps(session, user_id, [(today, 1200)]) == 1
    assert step_service.sync_steps(session, user_id, [(today, 5400), (today - timedelta(days=1), 9000)]) == 2

    rows = session.query(DailySteps).filter(DailySteps.user_id == user_id).order_by(DailySteps.step_date).all()
    assert [(r.step_date, r.steps) for r in rows] == [(today - timedelta(days=1), 9000), (today, 5400)]


def test_sync_duplicate_day_in_payload_last_wins(db_session):
    session, user_id = db_session
    today = user_today(session, user_id)
    step_service.sync_steps(session, user_id, [(today, 100), (today, 300)])
    assert session.query(DailySteps).filter(DailySteps.user_id == user_id).one().steps == 300


@pytest.mark.parametrize("steps", [-1, MAX_DAILY_STEPS + 1])
def test_sync_rejects_out_of_range_steps(db_session, steps):
    session, user_id = db_session
    with pytest.raises(AppValidationError) as exc:
        step_service.sync_steps(session, user_id, [(user_today(session, user_id), steps)])
    assert exc.value.code == "step_count_out_of_range"


@pytest.mark.parametrize("offset", [-1, MAX_STEP_SYNC_DAYS])
def test_sync_rejects_future_and_too_old_days(db_session, offset):
    session, user_id = db_session
    day = user_today(session, user_id) - timedelta(days=offset)
    with pytest.raises(AppValidationError) as exc:
        step_service.sync_steps(session, user_id, [(day, 100)])
    assert exc.value.code == "step_date_out_of_range"


def test_sync_is_all_or_nothing(db_session):
    session, user_id = db_session
    today = user_today(session, user_id)
    with pytest.raises(AppValidationError):
        step_service.sync_steps(session, user_id, [(today, 100), (today - timedelta(days=1), -5)])
    assert session.query(DailySteps).filter(DailySteps.user_id == user_id).count() == 0


# --- özet ---


def test_summary_without_data(db_session):
    session, user_id = db_session
    summary = step_service.get_step_summary(session, user_id)
    assert summary.has_data is False
    assert summary.today.steps == 0
    assert summary.days == []
    assert summary.average_steps is None
    assert "sayı verme" in summary.as_text()


def test_summary_with_weight_and_profile(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, height_cm=175, sex="male"))
    session.commit()
    progress_service.log_progress(session, user_id, weight=70)
    today = user_today(session, user_id)
    step_service.sync_steps(session, user_id, [(today - timedelta(days=2), 6000), (today, 10_000)])

    summary = step_service.get_step_summary(session, user_id)
    assert summary.has_data and summary.weight_known
    assert summary.today.steps == 10_000
    assert summary.today.calories == 254
    assert [d.steps for d in summary.days] == [6000, 10_000]
    assert summary.average_steps == 8000
    text = summary.as_text()
    assert "10000 adım" in text and "~254 kcal" in text
    assert "ek yemek hakkı" in text and "Ortalama: 8000" in text


def test_summary_without_weight_has_no_calories(db_session):
    session, user_id = db_session
    step_service.sync_steps(session, user_id, [(user_today(session, user_id), 4000)])
    summary = step_service.get_step_summary(session, user_id)
    assert summary.today.calories is None
    assert summary.weight_known is False
    assert "kalori tahmini yok" in summary.as_text()


def test_summary_counts_as_connected_when_only_old_data(db_session):
    session, user_id = db_session
    old_day = user_today(session, user_id) - timedelta(days=20)
    step_service.sync_steps(session, user_id, [(old_day, 4000)])
    summary = step_service.get_step_summary(session, user_id, days=7)
    assert summary.days == []
    assert summary.has_data is True


def test_sync_requires_consent(db_session):
    session, user_id = db_session
    user = session.get(User, user_id)
    assert user is not None
    user.steps_consent_at = None
    session.commit()
    with pytest.raises(step_service.StepsConsentRequired):
        step_service.sync_steps(session, user_id, [(user_today(session, user_id), 100)])
    assert session.query(DailySteps).count() == 0


def test_consent_records_time_and_version(db_session):
    session, user_id = db_session
    user = session.get(User, user_id)
    assert user is not None
    assert user.steps_consent_at is not None
    assert user.steps_consent_version == step_service.STEPS_CONSENT_VERSION
    assert step_service.get_step_summary(session, user_id).consented is True


def test_delete_all_steps_revokes_consent_and_user_delete_cascades(db_session):
    session, user_id = db_session
    today = user_today(session, user_id)
    step_service.sync_steps(session, user_id, [(today, 100)])
    assert step_service.delete_all_steps(session, user_id) == 1
    user = session.get(User, user_id)
    assert user is not None
    assert user.steps_consent_at is None and user.steps_consent_version is None
    with pytest.raises(step_service.StepsConsentRequired):
        step_service.sync_steps(session, user_id, [(today, 200)])

    step_service.give_steps_consent(session, user_id)
    step_service.sync_steps(session, user_id, [(today, 200)])

    user = session.get(User, user_id)
    session.delete(user)
    session.commit()
    assert session.query(DailySteps).count() == 0


def test_step_summary_tool_returns_service_text(db_session):
    session, user_id = db_session
    step_service.sync_steps(session, user_id, [(user_today(session, user_id), 7777)])
    tool = next(t for t in build_tracking_tools(session, user_id) if t.name == "get_step_summary")
    assert "7777 adım" in tool.invoke({})


# --- API ---


def _register_and_login(client, email):
    client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "supersecret",
            "kvkk_consent": True,
            "health_data_consent": True,
            "terms_consent": True,
        },
    )
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_steps_api_sync_get_delete(client):
    headers = _register_and_login(client, "steps-api@example.com")
    summary = client.get("/activity/steps", headers=headers).json()
    assert summary["has_data"] is False
    assert summary["consented"] is False
    today = summary["today"]["date"]

    # Rıza yokken eşitleme reddedilir (403, ekran dilinde mesaj).
    denied = client.put("/activity/steps", json={"days": [{"date": today, "steps": 1}]}, headers=headers)
    assert denied.status_code == 403
    assert "Apple Sağlık" in denied.json()["detail"]
    consent = client.post("/activity/steps/consent", headers=headers)
    assert consent.status_code == 200
    assert consent.json()["version"] == step_service.STEPS_CONSENT_VERSION

    response = client.put("/activity/steps", json={"days": [{"date": today, "steps": 8123}]}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"synced_days": 1}

    summary = client.get("/activity/steps", headers=headers).json()
    assert summary["has_data"] is True
    assert summary["today"]["steps"] == 8123
    assert summary["today"]["calories"] is None
    assert summary["last_synced_at"].endswith(("Z", "+00:00"))

    export = client.get("/users/me/export", headers=headers).json()
    assert [row["steps"] for row in export["daily_steps"]] == [8123]
    assert export["user"]["steps_consent_at"] is not None
    assert export["user"]["steps_consent_version"] == step_service.STEPS_CONSENT_VERSION

    assert client.delete("/activity/steps", headers=headers).status_code == 204
    after = client.get("/activity/steps", headers=headers).json()
    assert after["has_data"] is False and after["consented"] is False


def test_steps_api_validation_message_follows_screen_language(client):
    headers = _register_and_login(client, "steps-api-422@example.com")
    client.post("/activity/steps/consent", headers=headers)
    today = client.get("/activity/steps", headers=headers).json()["today"]["date"]
    body = {"days": [{"date": today, "steps": MAX_DAILY_STEPS + 1}]}

    tr = client.put("/activity/steps", json=body, headers=headers)
    assert tr.status_code == 422
    assert "Günlük adım sayısı" in tr.json()["detail"]

    en = client.put("/activity/steps", json=body, headers={**headers, "X-Preferred-Language": "en"})
    assert en.status_code == 422
    assert "Daily step count" in en.json()["detail"]


def test_steps_api_rejects_too_many_days_and_unknown_source(client):
    headers = _register_and_login(client, "steps-api-limits@example.com")
    client.post("/activity/steps/consent", headers=headers)
    today = client.get("/activity/steps", headers=headers).json()["today"]["date"]
    too_many = {"days": [{"date": today, "steps": 1}] * (MAX_STEP_SYNC_DAYS + 1)}
    assert client.put("/activity/steps", json=too_many, headers=headers).status_code == 422
    bad_source = {"source": "google_fit", "days": [{"date": today, "steps": 1}]}
    assert client.put("/activity/steps", json=bad_source, headers=headers).status_code == 422


def test_steps_api_requires_auth(client):
    assert client.get("/activity/steps").status_code == 401
    assert client.put("/activity/steps", json={"days": []}).status_code == 401
    assert client.post("/activity/steps/consent").status_code == 401
