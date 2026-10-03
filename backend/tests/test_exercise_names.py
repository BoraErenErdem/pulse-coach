"""Kayıtlı egzersiz adlarının arayüz diline göre gösterimi ve yorum
kartlarının ekrandaki dilde üretilmesi (2026-10-03 kullanıcı bildirimi:
İngilizce arayüzde TR kaydedilen hareketler TR, "Your Coach's Take" TR)."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.exercise_catalog import ExerciseCatalog
from app.models.user import User
from app.services import exercise_goal_service, workout_service
from app.services.workout_service import SetInput
from tests.db_utils import make_test_engine


def _catalog(session, source_id: str, name_tr: str, name_en: str) -> int:
    row = ExerciseCatalog(
        source_id=source_id,
        name_tr=name_tr,
        name_en=name_en,
        category_tr="kuvvet",
        primary_muscles_tr="göğüs",
        level_tr="orta",
    )
    session.add(row)
    session.commit()
    return row.id


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="names@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    try:
        yield session, user.id
    finally:
        session.close()


def _log(session, user_id, name, catalog_id, day, weight=60.0, reps=8):
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name=name, reps=reps, weight_kg=weight, exercise_catalog_id=catalog_id)],
        session_date=day,
    )


def test_set_saved_with_turkish_catalog_name_has_english_display_name(db_session):
    session, user_id = db_session
    bench = _catalog(session, "Dumbbell_Bench_Press", "Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")
    _log(session, user_id, "Dambıl Sehpada Göğüs Presi", bench, date.today())

    workout_set = workout_service.list_workout_sessions(session, user_id)[0].sets[0]
    assert workout_set.exercise_name_tr == "Dambıl Sehpada Göğüs Presi"
    assert workout_set.exercise_name_en == "Dumbbell Bench Press"


def test_name_that_does_not_match_its_catalog_row_is_not_translated(db_session):
    """Eski yanlış eşleşme (dev DB'de gerçek örnek: "Quad Machine" -> "Dip
    Machine"): katalog adı gösterilseydi kullanıcı yanlış hareket görürdü."""
    session, user_id = db_session
    dip = _catalog(session, "Dip_Machine", "Dip Makinesi", "Dip Machine")
    _log(session, user_id, "Quad Machine", dip, date.today())

    workout_set = workout_service.list_workout_sessions(session, user_id)[0].sets[0]
    assert (workout_set.exercise_name_tr, workout_set.exercise_name_en) == ("Quad Machine", "Quad Machine")


def test_same_exercise_logged_in_both_languages_is_one_logged_exercise(db_session):
    session, user_id = db_session
    squat = _catalog(session, "Squat", "Squat (Çömelme)", "Squat")
    today = date.today()
    _log(session, user_id, "Squat (Çömelme)", squat, today - timedelta(days=8))
    _log(session, user_id, "Squat", squat, today)
    # Formdan katalog bağı olmadan aynı EN adla yazılmış set de aynı gruba girer.
    _log(session, user_id, "squat", None, today)

    exercises = workout_service.list_logged_exercises(session, user_id)
    assert len(exercises) == 1
    assert exercises[0].set_count == 3
    assert (exercises[0].exercise_name_tr, exercises[0].exercise_name_en) == ("Squat (Çömelme)", "Squat")


def test_history_is_found_by_either_language_name(db_session):
    session, user_id = db_session
    squat = _catalog(session, "Squat", "Squat (Çömelme)", "Squat")
    today = date.today()
    _log(session, user_id, "Squat (Çömelme)", squat, today - timedelta(days=8), weight=60)
    _log(session, user_id, "Squat (Çömelme)", squat, today, weight=70)

    by_en = workout_service.get_exercise_history(session, user_id, "Squat")
    by_tr = workout_service.get_exercise_history(session, user_id, "squat (çömelme)")
    assert by_en is not None and by_tr is not None
    assert len(by_en.entries) == len(by_tr.entries) == 2
    assert by_en.exercise_name_en == "Squat"
    assert by_en.weekly is not None


def test_free_text_exercises_stay_separate_and_untranslated(db_session):
    session, user_id = db_session
    _log(session, user_id, "Kendi Hareketim", None, date.today())

    exercises = workout_service.list_logged_exercises(session, user_id)
    assert [(e.exercise_name_tr, e.exercise_name_en) for e in exercises] == [("Kendi Hareketim", "Kendi Hareketim")]
    assert workout_service.get_exercise_history(session, user_id, "Squat") is None


def test_exercise_goal_has_both_language_names(db_session):
    session, user_id = db_session
    bench = _catalog(session, "Dumbbell_Bench_Press", "Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")
    exercise_goal_service.set_exercise_goal(
        session, user_id, exercise_name="Dambıl Sehpada Göğüs Presi", target_weight_kg=30, exercise_catalog_id=bench
    )

    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)[0]
    assert (progress.exercise_name_tr, progress.exercise_name_en) == ("Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")


# --- API: yanıt alanları + yorum kartı dili ---


def _client_db():
    return next(app.dependency_overrides[get_db]())


def _auth(client, email):
    body = {"email": email, "password": "supersecret", "kvkk_consent": True, "health_data_consent": True, "terms_consent": True}
    client.post("/auth/register", json=body)
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_api_returns_both_language_names(client):
    headers = _auth(client, "names-api@example.com")
    bench = _catalog(_client_db(), "Dumbbell_Bench_Press", "Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Dambıl Sehpada Göğüs Presi", "reps": 8, "weight_kg": 20, "exercise_catalog_id": bench}]},
        headers=headers,
    )

    workout_set = client.get("/workouts/sessions", headers=headers).json()[0]["sets"][0]
    assert workout_set["exercise_name_en"] == "Dumbbell Bench Press"
    logged = client.get("/workouts/exercises", headers=headers).json()[0]
    assert logged["exercise_name_en"] == "Dumbbell Bench Press"
    history = client.get("/workouts/exercises/history", params={"exercise_name": "Dumbbell Bench Press"}, headers=headers)
    assert history.status_code == 200
    assert history.json()["exercise_name_tr"] == "Dambıl Sehpada Göğüs Presi"


def test_exercise_insight_uses_screen_language_and_localized_name(client, monkeypatch):
    """Profil dili tr iken ekran (X-Preferred-Language) en ise yorum İngilizce
    ve hareketin İngilizce adıyla üretilmeli."""
    from app.agents import motivation_agent

    captured = {}

    def fake_render(db, user_id, exercise_name, previous, latest, language=None):
        captured.update(exercise_name=exercise_name, language=language)
        return "ok"

    monkeypatch.setattr(motivation_agent, "render_exercise_progress_insight", fake_render)
    headers = _auth(client, "names-insight@example.com")
    client.patch("/profile", json={"preferred_language": "tr"}, headers=headers)
    squat = _catalog(_client_db(), "Squat", "Squat (Çömelme)", "Squat")
    today = date.today()
    for day, weight in ((today - timedelta(days=8), 60), (today, 70)):
        client.post(
            "/workouts/sessions",
            json={
                "session_date": day.isoformat(),
                "sets": [{"exercise_name": "Squat (Çömelme)", "reps": 8, "weight_kg": weight, "exercise_catalog_id": squat}],
            },
            headers=headers,
        )

    response = client.get(
        "/workouts/exercises/insight",
        params={"exercise_name": "Squat", "period": "weekly"},
        headers={**headers, "X-Preferred-Language": "en"},
    )
    assert response.status_code == 200
    assert captured == {"exercise_name": "Squat", "language": "en"}

    client.get(
        "/workouts/exercises/insight",
        params={"exercise_name": "Squat", "period": "weekly"},
        headers={**headers, "X-Preferred-Language": "tr"},
    )
    assert captured == {"exercise_name": "Squat (Çömelme)", "language": "tr"}


def test_resolve_language_prefers_header_then_profile():
    from starlette.requests import Request

    from app.services.language_resolve import resolve_language

    class _Db:  # profil sorgusu yapılmamalı: header geçerliyse önce o
        def query(self, *args, **kwargs):
            raise AssertionError("header varken profil okunmamalı")

    def request(headers):
        raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
        return Request({"type": "http", "headers": raw})

    user = User(id=1, email="x@example.com")
    assert resolve_language(request({"X-Preferred-Language": "en"}), _Db(), user) == "en"  # type: ignore[arg-type]
    assert resolve_language(request({"X-Preferred-Language": "fr"}), _Db(), None) == "tr"  # type: ignore[arg-type]


def test_editing_goal_with_english_name_updates_the_turkish_goal(db_session):
    session, user_id = db_session
    bench = _catalog(session, "Dumbbell_Bench_Press", "Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")
    exercise_goal_service.set_exercise_goal(
        session, user_id, exercise_name="Dambıl Sehpada Göğüs Presi", target_weight_kg=30, exercise_catalog_id=bench
    )
    # İngilizce arayüzdeki düzenleme penceresi katalog kimliği göndermiyor.
    exercise_goal_service.set_exercise_goal(session, user_id, exercise_name="Dumbbell Bench Press", target_weight_kg=35)

    goals = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert len(goals) == 1
    assert goals[0].target_weight_kg == 35


def test_workout_summary_follows_screen_language(client):
    headers = _auth(client, "names-summary@example.com")
    client.patch("/profile", json={"preferred_language": "tr"}, headers=headers)
    bench = _catalog(_client_db(), "Dumbbell_Bench_Press", "Dambıl Sehpada Göğüs Presi", "Dumbbell Bench Press")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Dambıl Sehpada Göğüs Presi", "reps": 8, "weight_kg": 20, "exercise_catalog_id": bench}]},
        headers=headers,
    )

    body = client.get("/workouts/summary", headers={**headers, "X-Preferred-Language": "en"}).json()
    assert body["sets_by_exercise"] == {"Dumbbell Bench Press": 1}
    assert "Dumbbell Bench Press" in body["summary_text"]
    assert "antrenman" not in body["summary_text"].lower()
