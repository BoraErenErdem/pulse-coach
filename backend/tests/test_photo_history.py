from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.meal_photo import MealPhoto
from app.models.user import User
from app.services import photo_history_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="photo-history@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_save_meal_photo_stores_bytes_mime_and_summary(db_session):
    session, user_id = db_session
    photo = photo_history_service.save_meal_photo(
        session, user_id, b"fake-jpeg-bytes", mime_type="image/jpeg", detected_food_names=["Somon", "Kinoa"]
    )

    assert photo.id is not None
    assert photo.detected_items_summary == "Somon, Kinoa"
    assert photo.mime_type == "image/jpeg"


def test_list_meal_photos_orders_newest_first_and_defers_image_data(db_session):
    session, user_id = db_session
    first = photo_history_service.save_meal_photo(session, user_id, b"one", "image/jpeg", ["Elma"])
    second = photo_history_service.save_meal_photo(session, user_id, b"two", "image/jpeg", ["Muz"])

    photos = photo_history_service.list_meal_photos(session, user_id)

    assert [p.id for p in photos] == [second.id, first.id]


def test_list_meal_photos_only_returns_current_users_photos(db_session):
    session, user_id = db_session
    other_user = User(email="photo-history-other@example.com", hashed_password="x")
    session.add(other_user)
    session.commit()
    session.refresh(other_user)

    photo_history_service.save_meal_photo(session, other_user.id, b"other", "image/jpeg", ["Elma"])
    mine = photo_history_service.save_meal_photo(session, user_id, b"mine", "image/jpeg", ["Muz"])

    photos = photo_history_service.list_meal_photos(session, user_id)

    assert [p.id for p in photos] == [mine.id]


def test_get_meal_photo_returns_none_for_other_users_photo(db_session):
    session, user_id = db_session
    other_user = User(email="photo-history-other2@example.com", hashed_password="x")
    session.add(other_user)
    session.commit()
    session.refresh(other_user)

    photo = photo_history_service.save_meal_photo(session, other_user.id, b"other", "image/jpeg", [])

    assert photo_history_service.get_meal_photo(session, user_id, photo.id) is None


def test_delete_meal_photo_removes_it_and_returns_false_if_missing(db_session):
    session, user_id = db_session
    photo = photo_history_service.save_meal_photo(session, user_id, b"one", "image/jpeg", ["Elma"])

    assert photo_history_service.delete_meal_photo(session, user_id, photo.id) is True
    assert photo_history_service.get_meal_photo(session, user_id, photo.id) is None
    assert photo_history_service.delete_meal_photo(session, user_id, photo.id) is False


def _register_and_login(client, email="photo-history-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _analyze_a_photo(client, headers, monkeypatch, detected_json):
    from app.services import photo_meal_service
    from tests.test_photo_meal import FAKE_JPEG_BYTES, _fake_llm

    monkeypatch.setattr(photo_meal_service, "get_llm", lambda **_kwargs: _fake_llm(detected_json))
    return client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=headers,
    )


def test_photo_history_requires_authentication(client):
    response = client.get("/nutrition/photo-history")
    assert response.status_code == 401


def test_analyzing_a_photo_saves_a_history_entry(client, monkeypatch):
    headers = _register_and_login(client)
    analyze_response = _analyze_a_photo(
        client, headers, monkeypatch, '[{"food_name": "ızgara tavuk göğsü", "estimated_grams": 150}]'
    )
    assert analyze_response.status_code == 200

    history_response = client.get("/nutrition/photo-history", headers=headers)
    assert history_response.status_code == 200
    body = history_response.json()
    assert len(body) == 1
    assert body[0]["detected_items_summary"] == "ızgara tavuk göğsü"


def test_photo_history_image_returns_raw_bytes(client, monkeypatch):
    headers = _register_and_login(client, email="photo-history-image@example.com")
    _analyze_a_photo(client, headers, monkeypatch, '[{"food_name": "elma", "estimated_grams": 100}]')

    history = client.get("/nutrition/photo-history", headers=headers).json()
    photo_id = history[0]["id"]

    image_response = client.get(f"/nutrition/photo-history/{photo_id}/image", headers=headers)
    assert image_response.status_code == 200
    from tests.test_photo_meal import FAKE_JPEG_BYTES

    assert image_response.content == FAKE_JPEG_BYTES
    assert image_response.headers["content-type"] == "image/jpeg"


def test_photo_history_image_requires_authentication(client):
    response = client.get("/nutrition/photo-history/1/image")
    assert response.status_code == 401


def test_photo_history_image_returns_404_for_unknown_photo(client):
    headers = _register_and_login(client, email="photo-history-404@example.com")
    response = client.get("/nutrition/photo-history/999999/image", headers=headers)
    assert response.status_code == 404


def test_photo_history_is_isolated_between_users(client, monkeypatch):
    headers_a = _register_and_login(client, email="photo-history-user-a@example.com")
    headers_b = _register_and_login(client, email="photo-history-user-b@example.com")

    _analyze_a_photo(client, headers_a, monkeypatch, '[{"food_name": "elma", "estimated_grams": 100}]')

    history_a = client.get("/nutrition/photo-history", headers=headers_a).json()
    history_b = client.get("/nutrition/photo-history", headers=headers_b).json()
    assert len(history_a) == 1
    assert history_b == []

    photo_id = history_a[0]["id"]
    cross_user_image = client.get(f"/nutrition/photo-history/{photo_id}/image", headers=headers_b)
    assert cross_user_image.status_code == 404


def _save_photo_with_age(session, user_id, days_ago: float, detected="Elma"):
    photo = photo_history_service.save_meal_photo(session, user_id, b"x", "image/jpeg", [detected])
    photo.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago)
    session.commit()
    return photo


def test_cleanup_old_meal_photos_removes_entries_older_than_retention_months(db_session):
    session, user_id = db_session
    old = _save_photo_with_age(session, user_id, days_ago=400)
    recent = _save_photo_with_age(session, user_id, days_ago=1)
    old_id, recent_id = old.id, recent.id

    deleted_count = photo_history_service.cleanup_old_meal_photos(
        session, retention_count=200, retention_months=12
    )

    assert deleted_count == 1
    remaining_ids = {row.id for row in session.query(MealPhoto).all()}
    assert remaining_ids == {recent_id}
    assert old_id not in remaining_ids


def test_cleanup_old_meal_photos_keeps_only_newest_n_per_user(db_session):
    session, user_id = db_session
    photos = [_save_photo_with_age(session, user_id, days_ago=i) for i in range(5)]

    deleted_count = photo_history_service.cleanup_old_meal_photos(
        session, retention_count=2, retention_months=120
    )

    assert deleted_count == 3
    remaining_ids = {row.id for row in session.query(MealPhoto).all()}
    # En yeni 2'si (days_ago=0 ve 1) kalmalı.
    assert remaining_ids == {photos[0].id, photos[1].id}


def test_cleanup_old_meal_photos_is_per_user(db_session):
    session, user_id = db_session
    other_user = User(email="photo-retention-other@example.com", hashed_password="x")
    session.add(other_user)
    session.commit()
    session.refresh(other_user)

    mine_old = _save_photo_with_age(session, user_id, days_ago=400)
    other_recent = _save_photo_with_age(session, other_user.id, days_ago=1)
    mine_old_id, other_recent_id = mine_old.id, other_recent.id

    deleted_count = photo_history_service.cleanup_old_meal_photos(
        session, retention_count=200, retention_months=12
    )

    assert deleted_count == 1
    remaining_ids = {row.id for row in session.query(MealPhoto).all()}
    assert remaining_ids == {other_recent_id}
    assert mine_old_id not in remaining_ids


def test_cleanup_old_meal_photos_returns_zero_when_nothing_stale(db_session):
    session, user_id = db_session
    _save_photo_with_age(session, user_id, days_ago=1)

    deleted_count = photo_history_service.cleanup_old_meal_photos(
        session, retention_count=200, retention_months=12
    )

    assert deleted_count == 0


def test_delete_photo_history_endpoint(client, monkeypatch):
    headers = _register_and_login(client, email="photo-history-delete@example.com")
    _analyze_a_photo(client, headers, monkeypatch, '[{"food_name": "elma", "estimated_grams": 100}]')

    history = client.get("/nutrition/photo-history", headers=headers).json()
    photo_id = history[0]["id"]

    delete_response = client.delete(f"/nutrition/photo-history/{photo_id}", headers=headers)
    assert delete_response.status_code == 204

    empty_history = client.get("/nutrition/photo-history", headers=headers).json()
    assert empty_history == []

    second_delete = client.delete(f"/nutrition/photo-history/{photo_id}", headers=headers)
    assert second_delete.status_code == 404
