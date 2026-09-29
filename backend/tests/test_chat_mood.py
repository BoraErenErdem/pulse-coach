"""Sohbetten ruh hali kaydı: onaydan sonra kaydet (2026-09-29)."""

import pytest
from sqlalchemy.orm import sessionmaker

from app.agents.mood_support_agent import MoodTurnState, build_mood_support_tools, normalize_mood_key
from app.agents.orchestrator import _ensure_mood_question, _has_false_success_claim
from app.db.base import Base
from app.models.user import User
from app.services import mood_service
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="mood-chat@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def _log_mood_tool(session, user_id, message, previous_reply="", state=None, language="tr"):
    tools = build_mood_support_tools(session, user_id, message, previous_reply, language, state)
    return next(t for t in tools if t.name == "log_mood")


# ---- ruh hali ----


@pytest.mark.parametrize(
    ("raw", "key"),
    [("dusuk", "dusuk"), ("Düşük", "dusuk"), ("ZOR", "zor"), ("nötr", "notr"), ("great", "harika"), ("uçuyorum", None), (None, None)],
)
def test_normalize_mood_key(raw, key):
    assert normalize_mood_key(raw) == key


def test_first_call_asks_instead_of_logging(db_session):
    session, user_id = db_session
    state = MoodTurnState()
    result = _log_mood_tool(session, user_id, "Bugün çok stresliyim", state=state).invoke({"mood": "dusuk"})

    assert result.startswith("Kaydedilmedi")
    assert state.question == 'Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?'
    assert state.question in result
    assert mood_service.get_mood(session, user_id) is None


def test_confirmation_after_question_logs(db_session):
    session, user_id = db_session
    question = 'Seni anlıyorum. Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?'
    result = _log_mood_tool(session, user_id, "evet, işaretle", previous_reply=question).invoke({"mood": "dusuk"})

    assert result.startswith("Kaydedildi")
    mood = mood_service.get_mood(session, user_id)
    assert mood is not None and mood.mood_key == "dusuk"


def test_model_worded_question_counts_as_asked(db_session):
    session, user_id = db_session
    previous = "Ruh halini bugün için 'Düşük' olarak kaydetmemi ister misin?"
    result = _log_mood_tool(session, user_id, "olur", previous_reply=previous).invoke({"mood": "dusuk"})
    assert result.startswith("Kaydedildi")


def test_decline_does_not_log(db_session):
    session, user_id = db_session
    question = 'Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?'
    result = _log_mood_tool(session, user_id, "Hayır, gerek yok", previous_reply=question).invoke({"mood": "dusuk"})
    assert result.startswith("Kaydedilmedi")
    assert mood_service.get_mood(session, user_id) is None


def test_explicit_request_logs_without_question(db_session):
    session, user_id = db_session
    result = _log_mood_tool(session, user_id, "Bugünkü ruh halimi harika olarak kaydet").invoke({"mood": "harika"})
    assert result.startswith("Kaydedildi")
    mood = mood_service.get_mood(session, user_id)
    assert mood is not None and mood.mood_key == "harika"


def test_future_feeling_is_not_logged_or_asked(db_session):
    session, user_id = db_session
    state = MoodTurnState()
    result = _log_mood_tool(session, user_id, "Yarın sunumum var, çok stresli olacağım", state=state).invoke(
        {"mood": "dusuk"}
    )
    assert result.startswith("Kaydedilmedi")
    assert state.question is None
    assert mood_service.get_mood(session, user_id) is None


def test_existing_widget_choice_is_not_overwritten_without_asking(db_session):
    session, user_id = db_session
    mood_service.log_mood(session, user_id, "iyi")
    state = MoodTurnState()
    _log_mood_tool(session, user_id, "Bugün biraz gerginim", state=state).invoke({"mood": "dusuk"})

    assert state.question == 'Bugün ruh halin "İyi" işaretli; "Düşük" olarak değiştireyim mi?'
    mood = mood_service.get_mood(session, user_id)
    assert mood is not None and mood.mood_key == "iyi"


def test_same_mood_already_marked_needs_no_question(db_session):
    session, user_id = db_session
    mood_service.log_mood(session, user_id, "harika")
    state = MoodTurnState()
    result = _log_mood_tool(session, user_id, "Bugün harika hissediyorum", state=state).invoke({"mood": "harika"})
    assert "zaten" in result
    assert state.question is None


def test_invalid_mood_value(db_session):
    session, user_id = db_session
    result = _log_mood_tool(session, user_id, "ruh halimi kaydet").invoke({"mood": "uçuyorum"})
    assert result.startswith("Kaydedilmedi")


def test_english_question(db_session):
    session, user_id = db_session
    state = MoodTurnState()
    _log_mood_tool(session, user_id, "I feel great today", state=state, language="en").invoke({"mood": "harika"})
    assert state.question == "Shall I mark today's mood as \"Great\"?"


def test_ensure_mood_question_appends_when_missing():
    state = MoodTurnState(question='Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?')
    reply = _ensure_mood_question("Stresli bir gün geçirmen çok anlaşılır.", state)
    assert state.question is not None and reply.endswith(state.question)
    # Model kendi cümlesiyle sorduysa ikinci soru eklenmez.
    asked = "Anlıyorum. Ruh halini düşük olarak kaydetmemi ister misin?"
    assert _ensure_mood_question(asked, state) == asked
    assert _ensure_mood_question("Tamam.", MoodTurnState()) == "Tamam."


def test_false_mood_claim_is_detected():
    assert _has_false_success_claim("Ruh halini düşük olarak işaretledim.", "tr")
    assert not _has_false_success_claim('Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?', "tr")


def test_tools_without_db_keep_only_supportive_response():
    assert [t.name for t in build_mood_support_tools()] == ["generate_supportive_response"]


# ---- kısa onayda model log_mood'u çağırmasa bile kayıt (kod yedeği) ----

_QUESTION = 'Yoğun bir gün geçirmişsin. Bugünkü ruh halini "Düşük" olarak işaretleyeyim mi?'


@pytest.mark.parametrize("message", ["Evet", "Evet, işaretle", "olur", "tamam lütfen"])
def test_short_affirmation_prepares_fallback_confirm(db_session, message):
    session, user_id = db_session
    state = MoodTurnState()
    build_mood_support_tools(session, user_id, message, _QUESTION, "tr", state)
    assert state.confirm is not None
    assert state.confirm() == 'Bugünkü ruh halin "Düşük" olarak işaretlendi.'
    mood = mood_service.get_mood(session, user_id)
    assert mood is not None and mood.mood_key == "dusuk"


@pytest.mark.parametrize(
    ("message", "previous"),
    [
        ("Hayır, gerek yok", _QUESTION),
        ("Evet ama aslında bugün çok daha kötüydü, berbattı yani", _QUESTION),  # uzun: model karar verir
        ("Evet", "Bugün antrenman yaptın mı?"),  # önceki mesaj ruh hali sorusu değil
    ],
)
def test_no_fallback_without_clear_short_confirmation(db_session, message, previous):
    session, user_id = db_session
    state = MoodTurnState()
    build_mood_support_tools(session, user_id, message, previous, "tr", state)
    assert state.confirm is None


def test_change_question_uses_target_label(db_session):
    session, user_id = db_session
    mood_service.log_mood(session, user_id, "iyi")
    state = MoodTurnState()
    build_mood_support_tools(
        session, user_id, "evet", 'Bugün ruh halin "İyi" işaretli; "Düşük" olarak değiştireyim mi?', "tr", state
    )
    assert state.confirm is not None
    state.confirm()
    mood = mood_service.get_mood(session, user_id)
    assert mood is not None and mood.mood_key == "dusuk"


def test_tool_call_marks_logged_so_fallback_is_skipped(db_session):
    session, user_id = db_session
    state = MoodTurnState()
    tool = _log_mood_tool(session, user_id, "evet", previous_reply=_QUESTION, state=state)
    tool.invoke({"mood": "dusuk"})
    assert state.logged is True


def test_append_mood_note():
    from app.agents.orchestrator import _append_mood_note

    note = 'Bugünkü ruh halin "Düşük" olarak işaretlendi.'
    assert _append_mood_note("Kendine iyi bak.", note) == f"Kendine iyi bak.\n\n{note}"
    assert _append_mood_note("Ruh halini işaretledim, kendine iyi bak.", note) == "Ruh halini işaretledim, kendine iyi bak."
    assert _append_mood_note("Kendine iyi bak.", None) == "Kendine iyi bak."
