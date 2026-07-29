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
