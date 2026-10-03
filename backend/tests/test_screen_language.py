"""İstek sırasında üretilen metinler ekrandaki dilde (X-Preferred-Language),
profil dili farklı olsa bile (2026-10-03: "diğer özetleri de ekran diline
bağla"). Header yoksa eskisi gibi profil dili."""

from datetime import date


def _auth(client, email):
    body = {"email": email, "password": "supersecret", "kvkk_consent": True, "health_data_consent": True, "terms_consent": True}
    client.post("/auth/register", json=body)
    token = client.post("/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.patch("/profile", json={"preferred_language": "tr"}, headers=headers)
    return headers


EN = {"X-Preferred-Language": "en"}


def test_nutrition_daily_summary_uses_screen_language(client):
    headers = _auth(client, "screen-nutrition@example.com")
    en = client.get("/nutrition/daily-summary", headers={**headers, **EN}).json()["summary_text"]
    tr = client.get("/nutrition/daily-summary", headers=headers).json()["summary_text"]
    assert en != tr
    assert "öğün" not in en.lower()


def test_progress_weekly_summary_uses_screen_language(client):
    headers = _auth(client, "screen-progress@example.com")
    client.post("/progress/log", json={"weight": 80, "log_date": date.today().isoformat()}, headers=headers)
    en = client.get("/progress/weekly-summary", headers={**headers, **EN}).json()["summary_text"]
    tr = client.get("/progress/weekly-summary", headers=headers).json()["summary_text"]
    assert en != tr
    assert "kilo" not in en.lower()


def test_validation_error_uses_screen_language(client):
    headers = _auth(client, "screen-error@example.com")
    response = client.post("/progress/log", json={"weight": 9999}, headers={**headers, **EN})
    assert response.status_code == 422
    assert "kg" in str(response.json()["detail"])
    tr = client.post("/progress/log", json={"weight": 9999}, headers=headers).json()["detail"]
    assert response.json()["detail"] != tr


def test_chat_passes_screen_language_to_orchestrator(client, monkeypatch):
    from app import chat_router

    seen = {}

    def fake_run(db, user_id, message, model_name=None, language=None):
        seen["language"] = language
        return "ok", "orchestrator"

    monkeypatch.setattr(chat_router, "run_orchestrator", fake_run)
    headers = _auth(client, "screen-chat@example.com")

    client.post("/chat", json={"message": "merhaba"}, headers={**headers, **EN})
    assert seen["language"] == "en"
    client.post("/chat", json={"message": "merhaba"}, headers=headers)
    assert seen["language"] == "tr"  # header yok -> profil


def test_chat_logged_exercise_name_follows_screen_language(client):
    """Sohbetten kaydedilen hareketin adı katalogdan ekrandaki dilde seçilir."""
    from app.agents.workout_tracking_agent import build_workout_tracking_tools
    from app.db.session import get_db
    from app.main import app
    from app.models.exercise_catalog import ExerciseCatalog
    from app.models.user import User
    from app.services import workout_service

    _auth(client, "screen-tool@example.com")
    db = next(app.dependency_overrides[get_db]())
    db.add(ExerciseCatalog(source_id="Pushups", name_tr="Şınav", name_en="Pushups", category_tr="kuvvet", primary_muscles_tr="göğüs", level_tr="başlangıç"))
    db.commit()
    user = db.query(User).filter(User.email == "screen-tool@example.com").one()

    tools = {t.name: t for t in build_workout_tracking_tools(db, user.id, language="en")}
    tools["log_exercise_set"].invoke({"exercise_name": "şınav", "reps": 10})

    workout_set = workout_service.list_workout_sessions(db, user.id)[0].sets[0]
    assert workout_set.exercise_name_snapshot == "Pushups"
