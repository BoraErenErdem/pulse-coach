from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.exercise_catalog import ExerciseCatalog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.services import workout_service
from app.services.workout_service import SetInput


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="workout@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_log_workout_session_saves_sets_with_auto_numbering(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session,
        user_id,
        workout_type="kuvvet",
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
            SetInput(exercise_name="Bench Press", reps=10, weight_kg=40),
        ],
    )

    assert result.id is not None
    assert len(result.sets) == 3
    squat_sets = [s for s in result.sets if s.exercise_name_snapshot == "Squat"]
    assert [s.set_number for s in squat_sets] == [1, 2]


def test_first_ever_set_is_not_flagged_as_record(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )
    assert result.sets[0].is_personal_record is False


def test_heavier_weight_than_history_is_flagged_as_record(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=8, weight_kg=65)]
    )
    assert result.sets[0].is_personal_record is True


def test_lighter_weight_than_history_is_not_flagged_as_record(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=55)]
    )
    assert result.sets[0].is_personal_record is False


def test_bulk_log_flags_progressive_records_within_same_call(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
            SetInput(exercise_name="Squat", reps=6, weight_kg=62),
        ],
    )
    flags = [s.is_personal_record for s in result.sets]
    # 1. set: ilk kayıt, temel yok -> rekor değil. 2. set: 65 > 60 -> rekor.
    # 3. set: 62 < 65 (aynı istekteki güncel en iyi) -> rekor değil.
    assert flags == [False, True, False]


def test_bodyweight_set_record_compares_reps_not_weight(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Şınav", reps=15)]
    )
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Şınav", reps=20)]
    )
    assert result.sets[0].is_personal_record is True


def test_record_detection_is_consistent_across_catalog_id_and_none(db_session):
    """Web formundan girilen setler exercise_catalog_id=None alır (form
    hiç katalog eşlemesi yapmıyor), chat aracıysa fuzzy-match ile bir
    katalog ID'si çözer — aynı isimle girilen setler bu yüzden farklı
    yollardan farklı exercise_catalog_id alabilir. Rekor karşılaştırması
    SADECE ID'ye göre yapılırsa bu iki geçmiş birbirinden kopar ve gerçek
    bir rekor kaçırılır."""
    session, user_id = db_session
    session.add(
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        )
    )
    session.commit()

    # "Web formu" gibi: katalog eşlemesi yok.
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60, exercise_catalog_id=None)]
    )
    # "Chat aracı" gibi: fuzzy-match sonucu bir katalog ID'si çözülmüş.
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=6, weight_kg=70, exercise_catalog_id=1)]
    )

    assert result.sets[0].is_personal_record is True


def test_update_workout_set_recomputes_record_flag(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=8, weight_kg=61)]
    )
    set_id = result.sets[0].id
    assert result.sets[0].is_personal_record is True

    # 61kg'lik "rekor" seti sonradan 50'ye düşürülürse artık rekor değil.
    updated = workout_service.update_workout_set(session, user_id, result.id, set_id, weight_kg=50)
    assert updated.is_personal_record is False

    # 70'e çıkarılırsa (60'ın üzerinde) tekrar rekor olmalı.
    updated = workout_service.update_workout_set(session, user_id, result.id, set_id, weight_kg=70)
    assert updated.is_personal_record is True


def test_log_workout_session_rejects_invalid_workout_type(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        workout_service.log_workout_session(
            session, user_id, workout_type="yüzme", sets=[SetInput(exercise_name="Squat", reps=10)]
        )


def test_log_workout_session_rejects_empty_sets(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        workout_service.log_workout_session(session, user_id, sets=[])


def test_log_workout_session_syncs_progress_log(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        workout_type="kardiyo",
        session_date=date.today(),
        sets=[SetInput(exercise_name="Koşu bandı", reps=1)],
    )

    logs = session.query(ProgressLog).filter(ProgressLog.user_id == user_id).all()
    assert len(logs) == 1
    assert logs[0].workout_completed is True
    assert logs[0].workout_type == "kardiyo"


def test_generate_workout_summary_computes_volume_and_breakdown(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
        ],
    )

    summary = workout_service.generate_workout_summary(session, user_id, days=7)

    assert summary.session_count == 1
    assert summary.total_sets == 2
    assert summary.total_volume_kg == 10 * 60 + 8 * 65
    assert summary.sets_by_exercise == {"Squat": 2}


def test_generate_workout_summary_empty_when_no_sessions(db_session):
    session, user_id = db_session
    summary = workout_service.generate_workout_summary(session, user_id)
    assert summary.session_count == 0
    assert "girilmemiş" in summary.as_text()


def test_list_workout_sessions_filters_by_days(db_session):
    session, user_id = db_session
    workout_service.log_workout_session(
        session,
        user_id,
        session_date=date.today() - timedelta(days=30),
        sets=[SetInput(exercise_name="Squat", reps=10)],
    )
    workout_service.log_workout_session(
        session,
        user_id,
        session_date=date.today() - timedelta(days=1),
        sets=[SetInput(exercise_name="Bench Press", reps=10)],
    )

    sessions = workout_service.list_workout_sessions(session, user_id, days=7)
    assert len(sessions) == 1
    assert sessions[0].sets[0].exercise_name_snapshot == "Bench Press"


def test_delete_workout_session_removes_session_and_sets(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )

    deleted = workout_service.delete_workout_session(session, user_id, result.id)

    assert deleted is True
    assert workout_service.get_workout_session(session, user_id, result.id) is None
    assert workout_service.generate_workout_summary(session, user_id).total_sets == 0


def test_delete_workout_session_returns_false_for_other_user(db_session):
    session, user_id = db_session
    other = User(email="other-workout@example.com", hashed_password="x")
    session.add(other)
    session.commit()
    session.refresh(other)

    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10)]
    )

    assert workout_service.delete_workout_session(session, other.id, result.id) is False
    assert workout_service.get_workout_session(session, user_id, result.id) is not None


def test_update_workout_session_changes_type_and_note(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session, user_id, workout_type="kuvvet", sets=[SetInput(exercise_name="Squat", reps=10)]
    )

    updated = workout_service.update_workout_session(
        session, user_id, result.id, workout_type="kardiyo", note="daha hafif gitti"
    )

    assert updated.workout_type == "kardiyo"
    assert updated.note == "daha hafif gitti"


def test_update_workout_session_rejects_invalid_type(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10)]
    )
    with pytest.raises(ValueError):
        workout_service.update_workout_session(session, user_id, result.id, workout_type="yüzme")


def test_delete_workout_set_removes_single_set(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=8, weight_kg=65),
        ],
    )
    set_to_remove = result.sets[0].id

    deleted = workout_service.delete_workout_set(session, user_id, result.id, set_to_remove)

    assert deleted is True
    remaining = workout_service.get_workout_session(session, user_id, result.id)
    assert len(remaining.sets) == 1
    assert remaining.sets[0].reps == 8


def test_update_workout_set_changes_reps_and_weight(db_session):
    session, user_id = db_session
    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
    )
    set_id = result.sets[0].id

    updated = workout_service.update_workout_set(session, user_id, result.id, set_id, reps=12, weight_kg=65)

    assert updated.reps == 12
    assert updated.weight_kg == 65


def test_update_workout_set_returns_none_for_other_user(db_session):
    session, user_id = db_session
    other = User(email="other-set@example.com", hashed_password="x")
    session.add(other)
    session.commit()
    session.refresh(other)

    result = workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Squat", reps=10)]
    )
    set_id = result.sets[0].id

    assert workout_service.update_workout_set(session, other.id, result.id, set_id, reps=1) is None


def test_list_workout_sessions_respects_limit(db_session):
    session, user_id = db_session
    for days_ago in (3, 2, 1):
        workout_service.log_workout_session(
            session,
            user_id,
            session_date=date.today() - timedelta(days=days_ago),
            sets=[SetInput(exercise_name="Squat", reps=10)],
        )

    limited = workout_service.list_workout_sessions(session, user_id, limit=2)

    assert len(limited) == 2
    # en yeni 2 kayıt, eskiden-yeniye sıralı dönmeli
    assert limited[0].session_date < limited[1].session_date
    assert limited[1].session_date == date.today() - timedelta(days=1)


def test_log_exercise_sets_bulk_tool_logs_all_sets_in_one_call(db_session):
    """log_exercise_sets_bulk, kullanıcının tek mesajda anlattığı tüm setleri
    tek bir tool-call'da kaydeder — LLM'e bağımlı olmayan, deterministik
    regresyon testi (bkz. tools_called=1 senaryosu, orchestrator.py)."""
    session, user_id = db_session
    session.add(
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        )
    )
    session.commit()

    tools = build_workout_tracking_tools(session, user_id)
    bulk_tool = next(t for t in tools if t.name == "log_exercise_sets_bulk")

    result = bulk_tool.invoke(
        {
            "sets": [
                {"exercise_name": "Squat", "reps": 10, "weight_kg": 60},
                {"exercise_name": "Squat", "reps": 8, "weight_kg": 65},
                {"exercise_name": "Bilinmeyen Egzersiz XYZ", "reps": 12},
            ],
            "workout_type": "kuvvet",
        }
    )

    assert "3 set kaydedildi" in result
    summary = workout_service.generate_workout_summary(session, user_id)
    assert summary.total_sets == 3

    sessions = workout_service.list_workout_sessions(session, user_id)
    squat_sets = [s for sess in sessions for s in sess.sets if s.exercise_name_snapshot == "Squat"]
    assert [s.set_number for s in squat_sets] == [1, 2]
    unknown_sets = [
        s for sess in sessions for s in sess.sets if s.exercise_name_snapshot == "Bilinmeyen Egzersiz XYZ"
    ]
    assert len(unknown_sets) == 1
    assert unknown_sets[0].exercise_catalog_id is None


def test_log_exercise_set_tool_mentions_new_record(db_session):
    session, user_id = db_session
    tools = build_workout_tracking_tools(session, user_id)
    single_tool = next(t for t in tools if t.name == "log_exercise_set")

    single_tool.invoke({"exercise_name": "Squat", "reps": 10, "weight_kg": 60})
    result = single_tool.invoke({"exercise_name": "Squat", "reps": 8, "weight_kg": 65})

    assert "YENİ KİŞİSEL REKORU" in result


def test_log_exercise_sets_bulk_tool_mentions_new_records(db_session):
    session, user_id = db_session
    tools = build_workout_tracking_tools(session, user_id)
    bulk_tool = next(t for t in tools if t.name == "log_exercise_sets_bulk")

    bulk_tool.invoke({"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]})
    result = bulk_tool.invoke({"sets": [{"exercise_name": "Squat", "reps": 8, "weight_kg": 65}]})

    assert "YENİ KİŞİSEL REKOR(LAR)" in result
    assert "Squat" in result


def _register_and_login(client, email="workout-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_log_session_endpoint(client):
    headers = _register_and_login(client, email="workout-api-log@example.com")
    response = client.post(
        "/workouts/sessions",
        json={
            "workout_type": "kuvvet",
            "sets": [
                {"exercise_name": "Squat", "reps": 10, "weight_kg": 60},
                {"exercise_name": "Squat", "reps": 8, "weight_kg": 65},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["sets"]) == 2
    assert body["sets"][0]["set_number"] == 1
    assert body["sets"][1]["set_number"] == 2


def test_log_session_endpoint_rejects_empty_sets(client):
    headers = _register_and_login(client, email="workout-api-empty@example.com")
    response = client.post(
        "/workouts/sessions", json={"workout_type": "kuvvet", "sets": []}, headers=headers
    )
    assert response.status_code == 422


def test_list_sessions_endpoint(client):
    headers = _register_and_login(client, email="workout-api-list@example.com")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10}]},
        headers=headers,
    )

    response = client.get("/workouts/sessions", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_summary_endpoint(client):
    headers = _register_and_login(client, email="workout-api-summary@example.com")
    client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]},
        headers=headers,
    )

    response = client.get("/workouts/summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["session_count"] == 1
    assert body["summary_text"].strip() != ""


def test_workouts_requires_authentication(client):
    response = client.get("/workouts/summary")
    assert response.status_code == 401


def test_delete_session_endpoint(client):
    headers = _register_and_login(client, email="workout-api-delete@example.com")
    create_response = client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]},
        headers=headers,
    )
    session_id = create_response.json()["id"]

    delete_response = client.delete(f"/workouts/sessions/{session_id}", headers=headers)
    assert delete_response.status_code == 204

    list_response = client.get("/workouts/sessions", headers=headers)
    assert list_response.json() == []


def test_delete_session_endpoint_not_found(client):
    headers = _register_and_login(client, email="workout-api-delete-404@example.com")
    response = client.delete("/workouts/sessions/999999", headers=headers)
    assert response.status_code == 404


def test_delete_session_endpoint_rejects_other_users_session(client):
    headers_a = _register_and_login(client, email="workout-api-owner-a@example.com")
    headers_b = _register_and_login(client, email="workout-api-owner-b@example.com")
    create_response = client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10}]},
        headers=headers_a,
    )
    session_id = create_response.json()["id"]

    response = client.delete(f"/workouts/sessions/{session_id}", headers=headers_b)
    assert response.status_code == 404

    still_there = client.get("/workouts/sessions", headers=headers_a)
    assert len(still_there.json()) == 1


def test_update_session_endpoint(client):
    headers = _register_and_login(client, email="workout-api-update@example.com")
    create_response = client.post(
        "/workouts/sessions",
        json={"workout_type": "kuvvet", "sets": [{"exercise_name": "Squat", "reps": 10}]},
        headers=headers,
    )
    session_id = create_response.json()["id"]

    response = client.patch(
        f"/workouts/sessions/{session_id}",
        json={"workout_type": "kardiyo", "note": "hafif gitti"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["workout_type"] == "kardiyo"
    assert response.json()["note"] == "hafif gitti"


def test_update_set_endpoint(client):
    headers = _register_and_login(client, email="workout-api-update-set@example.com")
    create_response = client.post(
        "/workouts/sessions",
        json={"sets": [{"exercise_name": "Squat", "reps": 10, "weight_kg": 60}]},
        headers=headers,
    )
    body = create_response.json()
    session_id, set_id = body["id"], body["sets"][0]["id"]

    response = client.patch(
        f"/workouts/sessions/{session_id}/sets/{set_id}",
        json={"reps": 12, "weight_kg": 65},
        headers=headers,
    )
    assert response.status_code == 200
    updated_set = next(s for s in response.json()["sets"] if s["id"] == set_id)
    assert updated_set["reps"] == 12
    assert updated_set["weight_kg"] == 65


def test_delete_set_endpoint(client):
    headers = _register_and_login(client, email="workout-api-delete-set@example.com")
    create_response = client.post(
        "/workouts/sessions",
        json={
            "sets": [
                {"exercise_name": "Squat", "reps": 10, "weight_kg": 60},
                {"exercise_name": "Squat", "reps": 8, "weight_kg": 65},
            ]
        },
        headers=headers,
    )
    body = create_response.json()
    session_id, set_id = body["id"], body["sets"][0]["id"]

    response = client.delete(f"/workouts/sessions/{session_id}/sets/{set_id}", headers=headers)
    assert response.status_code == 200
    assert len(response.json()["sets"]) == 1


def test_list_sessions_endpoint_respects_limit(client):
    headers = _register_and_login(client, email="workout-api-limit@example.com")
    for _ in range(3):
        client.post(
            "/workouts/sessions",
            json={"sets": [{"exercise_name": "Squat", "reps": 10}]},
            headers=headers,
        )

    response = client.get("/workouts/sessions?limit=2", headers=headers)
    assert len(response.json()) == 2


@pytest.mark.integration
def test_chat_logs_many_sets_in_one_message_without_crash_or_empty_reply(client):
    """Tek mesajda çok sayıda set loglanınca (LLM tek turda onlarca
    log_exercise_set tool-call'ı üretiyor) ToolNode bunları thread pool ile
    paralel çalıştırıyordu; hepsi aynı SQLAlchemy session'ı paylaştığı için
    ara sıra 'session is in prepared state' hatasıyla 500 dönüyor, çökmediği
    zaman da bazen boş reply üretiyordu (bkz. orchestrator.py: max_concurrency
    ve EMPTY_REPLY_FALLBACK)."""
    headers = _register_and_login(client, email="workout-chat-bulk@example.com")
    message = (
        "bugün omuz odaklı antrenman yaptım. shoulder press makinesinde 70kg 8 tekrar, "
        "75kg 7 tekrar, 80kg 6 tekrar ve 85kg 4 tekrar olmak üzere 4 set yaptım. sonra "
        "yan omuz (lateral raise) için 12kg, 10kg, 7.5kg ve 7.5kg ile 4 set 10'ar tekrar "
        "attım. sonra ön omuz (front raise) için 12kg ile 4 set 10 tekrar attım."
    )

    response = client.post("/chat", json={"message": message}, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["reply"].strip() != ""

    # Set sayısının tam 12 olması modelin sayma doğruluğuna bağlı (ayrı bir
    # konu) — burada asıl garanti edilen şey çökmeden/boş yanıt vermeden
    # çoğu seti kaydetmiş olması.
    summary_response = client.get("/workouts/summary", headers=headers)
    assert summary_response.json()["total_sets"] >= 6


@pytest.mark.integration
def test_chat_logs_exercise_set_via_tool_call(client):
    headers = _register_and_login(client, email="workout-chat@example.com")
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    db.add(
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/chat", json={"message": "Squat yaptım, 10 tekrar, 60 kilo kaldırdım."}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert "workout_tracking_agent" in body["agent_used"]

    summary_response = client.get("/workouts/summary", headers=headers)
    assert summary_response.json()["total_sets"] >= 1
