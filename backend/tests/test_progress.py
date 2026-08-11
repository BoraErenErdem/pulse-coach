from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile
from app.scheduler.jobs import weekly_summary_job
from app.services import progress_service


def _capture_checkin_emails(monkeypatch) -> list[tuple[str, str]]:
    """weekly_summary_job artık gerçek check-in e-postası göndermeye çalışıyor
    (bkz. jobs.py) - testlerde gerçek SMTP'ye (bu makinede .env'de gerçek
    Gmail kimlik bilgileri VAR) çıkılmasını engellemek için send_checkin_email
    burada sahte bir fonksiyonla değiştiriliyor, gönderilen (email, mesaj)
    çiftleri yakalanıyor."""
    from app.scheduler import jobs as jobs_module

    captured: list[tuple[str, str]] = []

    def fake_send(to_email: str, message: str) -> None:
        captured.append((to_email, message))

    monkeypatch.setattr(jobs_module.email_service, "send_checkin_email", fake_send)
    return captured


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="progress@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_log_progress_saves_entry(db_session):
    session, user_id = db_session
    entry = progress_service.log_progress(
        session, user_id, weight=78.5, workout_completed=True, workout_type="kuvvet"
    )
    assert entry.id is not None
    assert entry.weight == 78.5
    assert entry.workout_type == "kuvvet"


def test_log_progress_saves_waist_and_body_fat(db_session):
    session, user_id = db_session
    entry = progress_service.log_progress(session, user_id, weight=78.5, waist_cm=85.0, body_fat_pct=18.5)
    assert entry.waist_cm == 85.0
    assert entry.body_fat_pct == 18.5


# --- Sunucu-tarafı aralık doğrulaması (2026-08-11, kullanıcı bulgusu: canlı
# testte waist_cm=-50 ve body_fat_pct=150 sorunsuz kaydediliyordu - frontend
# min/max'ı doğrudan API isteğiyle bypass edilebiliyordu) ---


@pytest.mark.parametrize(
    "kwargs",
    [
        {"weight": -10},
        {"weight": 0},
        {"weight": 501},
        {"waist_cm": -50},
        {"waist_cm": 0},
        {"waist_cm": 301},
        {"body_fat_pct": -5},
        {"body_fat_pct": 0},
        {"body_fat_pct": 150},
    ],
)
def test_log_progress_rejects_out_of_range_values(db_session, kwargs):
    session, user_id = db_session
    with pytest.raises(ValueError):
        progress_service.log_progress(session, user_id, **kwargs)


@pytest.mark.parametrize(
    "kwargs",
    [{"weight": 500}, {"weight": 0.1}, {"waist_cm": 300}, {"waist_cm": 0.1}, {"body_fat_pct": 100}, {"body_fat_pct": 0.1}],
)
def test_log_progress_accepts_boundary_values(db_session, kwargs):
    session, user_id = db_session
    entry = progress_service.log_progress(session, user_id, **kwargs)
    assert entry.id is not None


def test_log_progress_endpoint_rejects_out_of_range_weight(client):
    headers = _register_and_login(client, email="progress-range-endpoint@example.com")
    response = client.post("/progress/log", json={"weight": -10, "workout_completed": False}, headers=headers)
    assert response.status_code == 422
    assert "500" in response.json()["detail"]


def test_log_progress_endpoint_rejects_out_of_range_value_respects_english_preference(client):
    headers = _register_and_login(client, email="progress-range-endpoint-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.post("/progress/log", json={"body_fat_pct": 150, "workout_completed": False}, headers=headers)
    assert response.status_code == 422
    assert "Body fat" in response.json()["detail"]


def test_chat_tool_log_progress_rejects_out_of_range_weight_without_raising(db_session):
    """Sohbet aracı (LLM'in hatalı bir sayı çıkarma ihtimali de var) hatayı
    dışarı sızdırmamalı - str(exc) ile Türkçe bir uyarı metnine düşmeli
    (bkz. tracking_agent.py, workout_tracking_agent.py ile AYNI desen)."""
    from app.agents.tracking_agent import build_tracking_tools

    session, user_id = db_session
    tools = build_tracking_tools(session, user_id)
    log_progress_tool = next(t for t in tools if t.name == "log_progress")

    result = log_progress_tool.invoke({"weight": 5000})
    assert "500" in result
    # Gerçekten kaydedilmediğini doğrula.
    assert progress_service.list_progress_logs(session, user_id) == []


def test_log_progress_rejects_invalid_workout_type(db_session):
    session, user_id = db_session
    with pytest.raises(ValueError):
        progress_service.log_progress(session, user_id, workout_completed=True, workout_type="yüzme")


def test_log_progress_clears_workout_type_when_not_completed(db_session):
    session, user_id = db_session
    entry = progress_service.log_progress(
        session, user_id, workout_completed=False, workout_type="kuvvet"
    )
    assert entry.workout_type is None


def test_generate_weekly_summary_counts_recent_entries(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, workout_completed=True, workout_type="kardiyo",
        log_date=date.today() - timedelta(days=2),
    )
    progress_service.log_progress(
        session, user_id, weight=79, workout_completed=True, workout_type="kuvvet",
        log_date=date.today() - timedelta(days=1),
    )
    progress_service.log_progress(
        session, user_id, weight=85, workout_completed=True, workout_type="kuvvet",
        log_date=date.today() - timedelta(days=30),
    )

    summary = progress_service.generate_weekly_summary(session, user_id)

    assert summary.log_count == 2
    assert summary.workout_count == 2
    assert summary.workout_types == {"kardiyo": 1, "kuvvet": 1}
    assert summary.weight_start == 80
    assert summary.weight_end == 79
    assert summary.weight_trend == -1


def test_generate_weekly_summary_counts_same_day_entries_once(db_session):
    """2026-08-06'da mobil canlı testinde bulundu: aynı gün birden fazla kilo
    girişi log_count'u yanıltıcı şekilde şişiriyordu (3 giriş = "3 kayıt").
    log_count artık KAYIT sayısı değil GÜN sayısı - aynı gün 3 ayrı satır
    eklense bile 1 sayılmalı."""
    session, user_id = db_session
    today = date.today()
    progress_service.log_progress(session, user_id, weight=80, log_date=today)
    progress_service.log_progress(session, user_id, weight=80.5, log_date=today)
    progress_service.log_progress(session, user_id, weight=79.8, log_date=today)
    progress_service.log_progress(
        session, user_id, workout_completed=True, workout_type="kuvvet",
        log_date=today - timedelta(days=1),
    )

    summary = progress_service.generate_weekly_summary(session, user_id)

    assert summary.log_count == 2  # bugün (3 satır -> 1 gün) + dün (1 gün)


def test_calculate_weekly_streak_counts_consecutive_weeks_including_current(db_session):
    session, user_id = db_session
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today())
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today() - timedelta(weeks=1))
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today() - timedelta(weeks=2))

    assert progress_service.calculate_weekly_streak(session, user_id) == 3


def test_calculate_weekly_streak_resets_after_gap_week(db_session):
    session, user_id = db_session
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today())
    # 1 hafta önce kayıt YOK - streak burada kesilmeli, 2 hafta önceki kayıt sayılmamalı.
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today() - timedelta(weeks=2))

    assert progress_service.calculate_weekly_streak(session, user_id) == 1


def test_calculate_weekly_streak_is_zero_when_current_week_has_no_log(db_session):
    session, user_id = db_session
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today() - timedelta(weeks=1))

    assert progress_service.calculate_weekly_streak(session, user_id) == 0


def test_calculate_weekly_streak_is_zero_when_no_logs(db_session):
    session, user_id = db_session
    assert progress_service.calculate_weekly_streak(session, user_id) == 0


def test_generate_weekly_summary_includes_streak_and_mentions_it_when_two_or_more(db_session):
    session, user_id = db_session
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today())
    progress_service.log_progress(session, user_id, weight=80, log_date=date.today() - timedelta(weeks=1))

    summary = progress_service.generate_weekly_summary(session, user_id)

    assert summary.streak_weeks == 2
    assert "üst üste" in summary.as_text().lower()


def test_list_progress_logs_orders_by_date_ascending(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=79, log_date=date.today() - timedelta(days=1)
    )
    progress_service.log_progress(
        session, user_id, weight=80, log_date=date.today() - timedelta(days=5)
    )

    logs = progress_service.list_progress_logs(session, user_id)

    assert [log.weight for log in logs] == [80, 79]


def test_list_progress_logs_filters_by_days(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=79, log_date=date.today() - timedelta(days=1)
    )

    logs = progress_service.list_progress_logs(session, user_id, days=7)

    assert [log.weight for log in logs] == [79]


def test_generate_weekly_summary_empty_when_no_logs(db_session):
    session, user_id = db_session
    summary = progress_service.generate_weekly_summary(session, user_id)
    assert summary.log_count == 0
    assert "girilmemiş" in summary.as_text()


def test_weekly_summary_as_text_respects_language(db_session):
    """as_text(language="en") kullanıcıya gösterilen İngilizce özet metnini
    üretmeli (Faz 2 takip talebi: progress/workouts/nutrition özetleri de
    TR/EN tercihine göre değişsin) - workout_types anahtarları da
    çevrilmeli, varsayılan (argümansız) çağrı hâlâ Türkçe kalmalı (agent
    tool'ları bunu değiştirmeden çağırıyor)."""
    session, user_id = db_session
    progress_service.log_progress(session, user_id, weight=80, workout_completed=True, workout_type="kuvvet")

    summary = progress_service.generate_weekly_summary(session, user_id)

    assert "logged" in summary.as_text("en").lower()
    assert "Strength" in summary.as_text("en")
    assert "girilmemiş" not in summary.as_text("en")
    # Varsayılan davranış (agent tool çağrıları) hâlâ Türkçe.
    assert "antrenman" in summary.as_text().lower()


@pytest.mark.integration
def test_weekly_summary_job_creates_checkin_messages(db_session, monkeypatch):
    captured_emails = _capture_checkin_emails(monkeypatch)
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    progress_service.log_progress(session, user_id, weight=70, workout_completed=True, workout_type="kuvvet")

    # Kullanıcının sohbet geçmişi yok, bu yüzden yedek/varsayılan saate düşer
    # (bkz. jobs.py::_preferred_checkin_hour) - current_hour'u o varsayılana
    # eşitleyerek testi gerçek saatten bağımsız/deterministik tutuyoruz.
    created = weekly_summary_job(session, current_hour=get_settings().weekly_checkin_hour)

    assert len(created) == 1
    assert created[0].user_id == user_id
    assert len(captured_emails) == 1
    assert captured_emails[0][0] == "progress@example.com"
    assert captured_emails[0][1] == created[0].message


def test_weekly_summary_job_skips_user_when_current_hour_does_not_match_default(db_session, monkeypatch):
    """Rekabet analizinden gelen öneri: check-in artık sabit bir saatte değil,
    kullanıcının (yeterli veri yoksa varsayılan) saatinde üretiliyor - bu
    saatin DIŞINDAKİ bir çalıştırmada hiçbir mesaj üretilmemeli. render_
    checkin_message hiç çağrılmadığı için gerçek Ollama gerekmiyor."""
    captured_emails = _capture_checkin_emails(monkeypatch)
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    progress_service.log_progress(session, user_id, weight=70, workout_completed=True, workout_type="kuvvet")

    default_hour = get_settings().weekly_checkin_hour
    mismatched_hour = (default_hour + 1) % 24

    created = weekly_summary_job(session, current_hour=mismatched_hour)

    assert created == []
    assert captured_emails == []


@pytest.mark.integration
def test_weekly_summary_job_personalizes_hour_from_conversation_history(db_session, monkeypatch):
    """Kullanıcının kendi mesaj gönderdiği saatlerden (Conversation.timestamp)
    tahmin edilen kişisel saat, sabit varsayılan saatin ÖNÜNE geçmeli."""
    from datetime import datetime, timezone

    from app.models.conversation import Conversation

    captured_emails = _capture_checkin_emails(monkeypatch)
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, goal="general_health"))
    session.commit()
    progress_service.log_progress(session, user_id, weight=70, workout_completed=True, workout_type="kuvvet")

    personalized_hour = 9
    for i in range(5):
        session.add(
            Conversation(
                user_id=user_id,
                role="user",
                content=f"mesaj {i}",
                timestamp=datetime(2026, 1, 1, personalized_hour, 0, tzinfo=timezone.utc),
            )
        )
    session.commit()

    default_hour = get_settings().weekly_checkin_hour
    assert weekly_summary_job(session, current_hour=default_hour) == []

    created = weekly_summary_job(session, current_hour=personalized_hour)
    assert len(created) == 1
    assert created[0].user_id == user_id
    assert created[0].message.strip() != ""
    assert len(captured_emails) == 1
    assert captured_emails[0][0] == "progress@example.com"


def _register_and_login(client, email="progress-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_log_progress_endpoint(client):
    headers = _register_and_login(client, email="progress-api-log@example.com")
    response = client.post(
        "/progress/log",
        json={"weight": 77.2, "workout_completed": True, "workout_type": "kardiyo"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["weight"] == 77.2
    assert body["workout_type"] == "kardiyo"


def test_log_progress_endpoint_rejects_invalid_workout_type(client):
    headers = _register_and_login(client, email="progress-api-invalid@example.com")
    response = client.post(
        "/progress/log",
        json={"workout_completed": True, "workout_type": "yüzme"},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Geçersiz antrenman türü: yüzme"


def test_log_progress_endpoint_validation_error_respects_english_preference(client):
    headers = _register_and_login(client, email="progress-api-422-en@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.post(
        "/progress/log",
        json={"workout_completed": True, "workout_type": "yüzme"},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid workout type: yüzme"


def test_weekly_summary_endpoint(client):
    headers = _register_and_login(client, email="progress-api-summary@example.com")
    client.post(
        "/progress/log",
        json={"weight": 70, "workout_completed": True, "workout_type": "esneklik"},
        headers=headers,
    )

    response = client.get("/progress/weekly-summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["log_count"] == 1
    assert body["workout_count"] == 1
    assert body["summary_text"].strip() != ""


def test_trends_endpoint_returns_weekly_points(client):
    headers = _register_and_login(client, email="progress-api-trends@example.com")
    client.post(
        "/progress/log",
        json={"weight": 80, "workout_completed": True, "workout_type": "kuvvet"},
        headers=headers,
    )
    client.post("/mood", json={"mood_key": "iyi"}, headers=headers)

    response = client.get("/progress/trends?weeks=4", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["points"]) == 4
    current_week = body["points"][-1]
    assert current_week["workout_days"] == 1
    assert current_week["avg_mood_score"] == pytest.approx(4.0)
    # 4 haftadan az yalnızca 1 haftası verili - korelasyon hesaplanamaz.
    assert body["mood_workout_correlation"] is None


def test_trends_requires_authentication(client):
    response = client.get("/progress/trends")
    assert response.status_code == 401


def test_list_logs_endpoint_returns_entries_in_date_order(client):
    headers = _register_and_login(client, email="progress-api-logs@example.com")
    client.post(
        "/progress/log",
        json={"weight": 80, "workout_completed": True, "workout_type": "kuvvet"},
        headers=headers,
    )
    client.post(
        "/progress/log",
        json={"weight": 79.5, "workout_completed": False},
        headers=headers,
    )

    response = client.get("/progress/logs", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["log_date"] <= body[1]["log_date"]


def test_list_logs_endpoint_filters_by_days(client):
    headers = _register_and_login(client, email="progress-api-logs-days@example.com")
    client.post("/progress/log", json={"weight": 80}, headers=headers)

    response = client.get("/progress/logs", params={"days": 1}, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_progress_requires_authentication(client):
    response = client.get("/progress/weekly-summary")
    assert response.status_code == 401


@pytest.mark.integration
def test_chat_logs_progress_via_tool_call(client):
    headers = _register_and_login(client, email="progress-chat@example.com")
    response = client.post(
        "/chat",
        json={"message": "Bugün 78 kilo geldim, antrenman da yaptım, kuvvet çalıştım."},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "tracking_agent" in body["agent_used"]

    summary_response = client.get("/progress/weekly-summary", headers=headers)
    assert summary_response.json()["log_count"] == 1


@pytest.mark.integration
def test_chat_weekly_summary_via_tool_call(client):
    headers = _register_and_login(client, email="progress-chat-summary@example.com")
    client.post(
        "/progress/log",
        json={"weight": 70, "workout_completed": True, "workout_type": "kardiyo"},
        headers=headers,
    )

    response = client.post("/chat", json={"message": "Bu haftam nasıl geçmiş?"}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "tracking_agent" in body["agent_used"]


# --- get_body_composition_insight (2026-08-11, kullanıcı isteği: kilo tek
# başına yanıltıcı olabilir, bel çevresi/yağ oranı iyileşmesi tartının
# göstermediği ilerlemeyi fark ettiriyor) ---


def test_body_composition_insight_none_with_zero_or_one_measurement(db_session):
    session, user_id = db_session
    assert progress_service.get_body_composition_insight(session, user_id) is None

    progress_service.log_progress(session, user_id, weight=80, waist_cm=90)
    assert progress_service.get_body_composition_insight(session, user_id) is None


def test_body_composition_insight_none_when_gap_too_small(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=90, log_date=date.today() - timedelta(days=10)
    )
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=87, log_date=date.today() - timedelta(days=1)
    )
    # Aralarında sadece 9 gün var (<14 gün eşiği) - bel 3cm azalmış olsa
    # bile bu kadar kısa aralıkta anlamlı bir trend sayılmıyor.
    assert progress_service.get_body_composition_insight(session, user_id) is None


def test_body_composition_insight_none_when_no_composition_improvement(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=90, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=89.5, log_date=date.today()
    )
    # Kilo sabit, bel sadece 0.5cm azalmış (<1cm eşiği) - anlamlı bir
    # sapma yok, içgörü üretilmemeli.
    assert progress_service.get_body_composition_insight(session, user_id) is None


def test_body_composition_insight_none_when_weight_decreased(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=85, waist_cm=95, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=90, log_date=date.today()
    )
    # Kilo da azalmış (beklenen/olumlu bir sonuç) - ayrıca vurgulanacak
    # "tartının göstermediği" bir sürpriz yok, None dönmeli.
    assert progress_service.get_body_composition_insight(session, user_id) is None


def test_body_composition_insight_flat_weight_scenario(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=95, body_fat_pct=22, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=80.2, waist_cm=92, body_fat_pct=21, log_date=date.today()
    )
    message = progress_service.get_body_composition_insight(session, user_id)
    assert message is not None
    assert "belin" in message
    assert "yağ oranın" in message
    assert "kilon" in message.lower()


def test_body_composition_insight_weight_gain_scenario_reads_as_muscle_gain(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=75, waist_cm=90, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=77, waist_cm=88, log_date=date.today()
    )
    message = progress_service.get_body_composition_insight(session, user_id)
    assert message is not None
    assert "kas kazanımının" in message
    assert "olumsuz yorumlamana gerek yok" in message


def test_body_composition_insight_respects_english_preference(db_session):
    session, user_id = db_session
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=95, log_date=date.today() - timedelta(days=30)
    )
    progress_service.log_progress(
        session, user_id, weight=80, waist_cm=92, log_date=date.today()
    )
    message = progress_service.get_body_composition_insight(session, user_id, language="en")
    assert message is not None
    assert "waist" in message
    assert "kilon" not in message.lower()


def test_body_composition_insight_endpoint(client):
    headers = _register_and_login(client, email="progress-bodycomp@example.com")
    client.post(
        "/progress/log",
        json={"weight": 80, "waist_cm": 95},
        headers=headers,
    )
    response = client.get("/progress/body-composition-insight", headers=headers)
    assert response.status_code == 200
    # Henüz tek ölçüm var - yeterli veri yok, message None dönmeli.
    assert response.json()["message"] is None
