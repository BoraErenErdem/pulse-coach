import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User
from app.services import exercise_goal_service, workout_service
from app.services.workout_service import SetInput


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="exgoal@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_set_exercise_goal_creates_new_goal(db_session):
    session, user_id = db_session
    goal = exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    assert goal.id is not None
    assert goal.target_weight_kg == 100


def test_set_exercise_goal_upserts_same_exercise(db_session):
    session, user_id = db_session
    first = exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    second = exercise_goal_service.set_exercise_goal(session, user_id, "squat", 110)
    assert first.id == second.id
    assert second.target_weight_kg == 110


def test_set_exercise_goal_rejects_non_positive_weight(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 0)


def test_delete_exercise_goal_removes_it(db_session):
    session, user_id = db_session
    goal = exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    assert exercise_goal_service.delete_exercise_goal(session, user_id, goal.id) is True
    assert exercise_goal_service.list_exercise_goal_progress(session, user_id) == []


def test_delete_exercise_goal_returns_false_for_wrong_user(db_session):
    session, user_id = db_session
    other = User(email="other@example.com", hashed_password="x")
    session.add(other)
    session.commit()
    session.refresh(other)
    goal = exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    assert exercise_goal_service.delete_exercise_goal(session, other.id, goal.id) is False


def test_list_exercise_goal_progress_computes_best_weight(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Squat", reps=10, weight_kg=60),
            SetInput(exercise_name="Squat", reps=5, weight_kg=80),
        ],
    )

    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert len(progress) == 1
    assert progress[0].best_weight_kg == 80
    assert progress[0].progress_pct == 80.0


def test_list_exercise_goal_progress_zero_when_no_history(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Deadlift", 150)
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].best_weight_kg is None
    assert progress[0].progress_pct == 0.0


def test_list_exercise_goal_progress_caps_at_100(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Bench Press", 50)
    workout_service.log_workout_session(
        session, user_id, sets=[SetInput(exercise_name="Bench Press", reps=5, weight_kg=70)]
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].progress_pct == 100.0


def test_list_exercise_goal_progress_matches_across_languages_via_catalog_id(db_session):
    """2026-08-11 kullanıcı bulgusu: bir dilde ("Barbell Squat") kaydedilen
    hedef, kullanıcı dil tercihini değiştirip aynı egzersizi diğer dilde
    ("Halter Squat") kaydedince ilerlemesi sıfırlanmış gibi görünüyordu.
    Kök neden frontend'deydi (antrenman formu set kaydında hiç
    exercise_catalog_id göndermiyordu, bkz. workouts.tsx/page.tsx) - bu
    test, catalog_id TUTARLI gönderildiğinde (artık frontend'in yaptığı
    gibi) isim metni diller arasında farklı olsa bile ilerlemenin doğru
    hesaplandığını sabitliyor."""
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Barbell Squat", 100, exercise_catalog_id=42)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Halter Squat", reps=5, weight_kg=90, exercise_catalog_id=42)],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert len(progress) == 1
    assert progress[0].best_weight_kg == 90
    assert progress[0].progress_pct == 90.0


def test_list_exercise_goal_progress_zero_when_catalog_id_missing_and_names_differ(db_session):
    """Yukarıdaki testin tam tersi - catalog_id HİÇ gönderilmezse (fix
    ÖNCESİ frontend davranışı) ve isim metni dile göre farklıysa,
    ilerleme geçmişi bulamaz ve %0 kalır. Bu test bug'ın MEKANİZMASINI
    belgeliyor: sorun bu fonksiyonların mantığında değildi (ki zaten
    catalog_id verildiğinde doğru çalışıyorlardı, bkz. yukarıdaki test),
    sorun frontend'in catalog_id'yi hiç göndermemesindeydi."""
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Barbell Squat", 100, exercise_catalog_id=42)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Halter Squat", reps=5, weight_kg=90, exercise_catalog_id=None)],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert len(progress) == 1
    assert progress[0].best_weight_kg is None
    assert progress[0].progress_pct == 0.0


# --- Hedef-ulaşma push bildirimi (2026-08-12) - uçtan uca (gerçek
# notify_set_logged + find_active_goal_for_exercise, sadece dış push
# gönderimi (requests.post) sahteleniyor) ---


def _patch_push_post(monkeypatch):
    from app.services import push_service

    sent = []

    def fake_post(url, json, headers, timeout):
        sent.append(json)
        from types import SimpleNamespace

        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": {"status": "ok"}})

    monkeypatch.setattr(push_service.requests, "post", fake_post)
    return sent


def _give_push_token(session, user_id):
    from app.models.user import User

    user = session.get(User, user_id)
    user.expo_push_token = "ExponentPushToken[x]"
    session.commit()


def test_goal_reached_push_fires_exactly_on_crossing_set(db_session, monkeypatch):
    session, user_id = db_session
    _give_push_token(session, user_id)
    sent = _patch_push_post(monkeypatch)
    exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)

    # Önceki en iyi < hedef (90 < 100) - henüz ulaşılmadı, push YOK.
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=5, weight_kg=90)
    assert sent == []

    # Bu set hedefi karşılıyor (100 >= 100) - TAM geçiş anı, push OLMALI.
    # (Bu set AYNI ZAMANDA bir PR de olduğu için iki push gider - PR + hedef;
    # burada SADECE hedef push'unun varlığını doğruluyoruz.)
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=1, weight_kg=100)
    goal_pushes = [s for s in sent if s.get("data", {}).get("type") == "goal"]
    assert len(goal_pushes) == 1
    assert "Squat" in goal_pushes[0]["title"]


def test_goal_reached_push_does_not_refire_on_subsequent_sets_above_target(db_session, monkeypatch):
    session, user_id = db_session
    _give_push_token(session, user_id)
    exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=1, weight_kg=100)

    sent = _patch_push_post(monkeypatch)
    # Hedefe zaten ulaşılmıştı (önceki en iyi=100 >= hedef=100) - tekrar
    # tetiklenmemeli, sadece PR bildirimi (varsa) gidebilir ama hedef push'u YOK.
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=1, weight_kg=110)

    goal_pushes = [s for s in sent if s.get("data", {}).get("type") == "goal"]
    assert goal_pushes == []


def test_goal_reached_push_does_not_fire_when_previous_best_already_met_target(db_session, monkeypatch):
    session, user_id = db_session
    _give_push_token(session, user_id)
    # Önce 100kg'lik bir set girilir (henüz hedef yokken).
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=1, weight_kg=100)
    # Hedef SONRADAN, zaten karşılanmış bir değere (100) ayarlanır.
    exercise_goal_service.set_exercise_goal(session, user_id, "Squat", 100)

    sent = _patch_push_post(monkeypatch)
    # Yeni bir 100kg set daha - önceki en iyi (100) zaten hedefi (100)
    # karşılıyordu, bu "yeni" bir geçiş değil, push OLMAMALI.
    workout_service.log_single_set(session, user_id, exercise_name="Squat", reps=1, weight_kg=100)

    goal_pushes = [s for s in sent if s.get("data", {}).get("type") == "goal"]
    assert goal_pushes == []


def _register_and_login(client, email="exgoal-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_set_goal_endpoint(client):
    headers = _register_and_login(client, email="exgoal-api-set@example.com")
    response = client.post(
        "/exercise-goals", json={"exercise_name": "Squat", "target_weight_kg": 100}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["target_weight_kg"] == 100


def test_set_goal_endpoint_rejects_non_positive_weight(client):
    headers = _register_and_login(client, email="exgoal-api-invalid@example.com")
    response = client.post(
        "/exercise-goals", json={"exercise_name": "Squat", "target_weight_kg": -5}, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Hedef ağırlık sıfırdan büyük olmalı."


def test_set_goal_endpoint_validation_error_respects_english_preference(client):
    headers = _register_and_login(client, email="exgoal-api-422-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.post(
        "/exercise-goals", json={"exercise_name": "Squat", "target_weight_kg": -5}, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Target weight must be greater than zero."


def test_list_and_delete_goal_endpoints(client):
    headers = _register_and_login(client, email="exgoal-api-list@example.com")
    create_response = client.post(
        "/exercise-goals", json={"exercise_name": "Squat", "target_weight_kg": 100}, headers=headers
    )
    goal_id = create_response.json()["id"]

    list_response = client.get("/exercise-goals", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    delete_response = client.delete(f"/exercise-goals/{goal_id}", headers=headers)
    assert delete_response.status_code == 204

    list_response_after = client.get("/exercise-goals", headers=headers)
    assert list_response_after.json() == []


def test_delete_nonexistent_goal_returns_404(client):
    headers = _register_and_login(client, email="exgoal-api-404@example.com")
    response = client.delete("/exercise-goals/9999", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Hedef bulunamadı."


def test_delete_nonexistent_goal_respects_english_preference(client):
    """Regresyon: REST 404 mesajları artık preferred_language'e göre
    İngilizce dönebiliyor (2026-08-10 pürüz taraması, Tema C)."""
    headers = _register_and_login(client, email="exgoal-api-404-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.delete("/exercise-goals/9999", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Goal not found."


# --- Opsiyonel tekrar alt-hedefi + süre (kardiyo) hedefi (2026-08-27) ---


def test_set_exercise_goal_rejects_neither_weight_nor_duration(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        exercise_goal_service.set_exercise_goal(session, user_id, "Squat")


def test_set_exercise_goal_rejects_both_weight_and_duration(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        exercise_goal_service.set_exercise_goal(
            session, user_id, "Koşu", target_weight_kg=60, target_duration_minutes=30
        )


def test_set_exercise_goal_rejects_non_positive_target_reps(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        exercise_goal_service.set_exercise_goal(session, user_id, "Squat", target_weight_kg=60, target_reps=0)


def test_set_exercise_goal_rejects_non_positive_duration(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        exercise_goal_service.set_exercise_goal(session, user_id, "Koşu", target_duration_minutes=0)


def test_weight_goal_with_rep_target_requires_reps_at_target_weight(db_session):
    """60 kg'da 8 tekrar hedefi: 60 kg'ın ALTINDA daha fazla tekrar atmak
    hedefi tamamlamamalı, sadece 60 kg'da (veya üstünde) 8+ tekrar tamamlar."""
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Bench Press", target_weight_kg=60, target_reps=8)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Bench Press", reps=12, weight_kg=40)],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].best_weight_kg == 40
    assert progress[0].best_reps is None
    assert progress[0].progress_pct == 0.0


def test_weight_goal_with_rep_target_completes_when_both_met_in_one_set(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Bench Press", target_weight_kg=60, target_reps=8)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[
            SetInput(exercise_name="Bench Press", reps=5, weight_kg=60),
            SetInput(exercise_name="Bench Press", reps=8, weight_kg=60),
        ],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].best_reps == 8
    assert progress[0].progress_pct == 100.0


def test_weight_goal_with_rep_target_increasing_weight_alone_does_not_complete(db_session):
    """Kullanıcının sorduğu tasarım sorusu: sadece kilo artırmak (yeterli
    tekrar atmadan) 'tekrar hedefini' TEK BAŞINA tamamlamaz - ağırlık VE
    tekrar AYNI sette birlikte karşılanmalı."""
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Bench Press", target_weight_kg=60, target_reps=8)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Bench Press", reps=3, weight_kg=70)],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].best_weight_kg == 70
    # 70 kg hedef ağırlığın (60) ÜSTÜNDE olduğu için "hedef ağırlıkta en iyi
    # tekrar" olarak sayılır (3), ama 3 < 8 olduğu için hedef TAMAMLANMAZ.
    assert progress[0].best_reps == 3
    assert progress[0].progress_pct == 37.5


def test_weight_goal_with_rep_target_heavier_weight_with_enough_reps_completes(db_session):
    """...ama daha ağır bir kiloda hedeflenen tekrarı (veya fazlasını)
    atmak yine tamamlar - hedef ağırlık bir TABAN, tavan değil."""
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Bench Press", target_weight_kg=60, target_reps=8)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Bench Press", reps=8, weight_kg=70)],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].best_reps == 8
    assert progress[0].progress_pct == 100.0


def test_duration_goal_computes_progress_from_best_duration(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Koşu Bandı", target_duration_minutes=30)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Koşu Bandı", duration_minutes=15, cardio_category="kosu", intensity="orta")],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].target_duration_minutes == 30
    assert progress[0].best_duration_minutes == 15
    assert progress[0].progress_pct == 50.0
    assert progress[0].target_weight_kg is None
    assert progress[0].best_weight_kg is None


def test_duration_goal_caps_progress_at_100(db_session):
    session, user_id = db_session
    exercise_goal_service.set_exercise_goal(session, user_id, "Koşu Bandı", target_duration_minutes=30)
    workout_service.log_workout_session(
        session,
        user_id,
        sets=[SetInput(exercise_name="Koşu Bandı", duration_minutes=45, cardio_category="kosu", intensity="orta")],
    )
    progress = exercise_goal_service.list_exercise_goal_progress(session, user_id)
    assert progress[0].progress_pct == 100.0


def test_set_goal_endpoint_with_rep_target(client):
    headers = _register_and_login(client, email="exgoal-api-reps@example.com")
    response = client.post(
        "/exercise-goals",
        json={"exercise_name": "Bench Press", "target_weight_kg": 60, "target_reps": 8},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target_weight_kg"] == 60
    assert body["target_reps"] == 8


def test_set_goal_endpoint_with_duration_target(client):
    headers = _register_and_login(client, email="exgoal-api-duration@example.com")
    response = client.post(
        "/exercise-goals",
        json={"exercise_name": "Koşu Bandı", "target_duration_minutes": 30},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target_duration_minutes"] == 30
    assert body["target_weight_kg"] is None


def test_set_goal_endpoint_rejects_neither_weight_nor_duration(client):
    headers = _register_and_login(client, email="exgoal-api-empty@example.com")
    response = client.post("/exercise-goals", json={"exercise_name": "Squat"}, headers=headers)
    assert response.status_code == 422


def test_exercise_goals_requires_authentication(client):
    response = client.get("/exercise-goals")
    assert response.status_code == 401


@pytest.mark.integration
def test_chat_sets_exercise_goal_via_tool_call(client):
    headers = _register_and_login(client, email="exgoal-chat@example.com")
    response = client.post(
        "/chat", json={"message": "Squat'ta 100 kiloya ulaşmak istiyorum, bunu hedef olarak kaydeder misin?"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert "workout_tracking_agent" in body["agent_used"]

    list_response = client.get("/exercise-goals", headers=headers)
    assert len(list_response.json()) >= 1
