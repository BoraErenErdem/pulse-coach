"""Serbest metin girdilerinin üst sınırı (2026-10-13 canlı test): egzersiz adı,
oturum notu ve tek istekteki set sayısı sınırsızdı - 200 bin karakterlik not
kaydediliyor, uzun not Antrenman sayfasını yatay taşırıyordu."""

import pytest
from pydantic import ValidationError

from app.schemas.exercise_goal import ExerciseGoalCreate
from app.schemas.workout import WorkoutSessionCreate, WorkoutSessionUpdate, WorkoutSetCreate
from app.services.limits import MAX_EXERCISE_NAME_LENGTH, MAX_SETS_PER_REQUEST, MAX_WORKOUT_NOTE_LENGTH


def test_exercise_name_at_limit_is_accepted():
    WorkoutSetCreate(exercise_name="x" * MAX_EXERCISE_NAME_LENGTH, reps=5)
    ExerciseGoalCreate(exercise_name="x" * MAX_EXERCISE_NAME_LENGTH, target_weight_kg=50)


def test_too_long_exercise_name_is_rejected():
    with pytest.raises(ValidationError):
        WorkoutSetCreate(exercise_name="x" * (MAX_EXERCISE_NAME_LENGTH + 1), reps=5)
    with pytest.raises(ValidationError):
        ExerciseGoalCreate(exercise_name="x" * (MAX_EXERCISE_NAME_LENGTH + 1), target_weight_kg=50)


def test_too_long_session_note_is_rejected():
    one_set = [WorkoutSetCreate(exercise_name="Şınav", reps=5)]
    WorkoutSessionCreate(note="n" * MAX_WORKOUT_NOTE_LENGTH, sets=one_set)
    with pytest.raises(ValidationError):
        WorkoutSessionCreate(note="n" * (MAX_WORKOUT_NOTE_LENGTH + 1), sets=one_set)
    with pytest.raises(ValidationError):
        WorkoutSessionUpdate(note="n" * (MAX_WORKOUT_NOTE_LENGTH + 1))


def test_too_many_sets_in_one_request_is_rejected():
    one_set = WorkoutSetCreate(exercise_name="Şınav", reps=5)
    WorkoutSessionCreate(sets=[one_set] * MAX_SETS_PER_REQUEST)
    with pytest.raises(ValidationError):
        WorkoutSessionCreate(sets=[one_set] * (MAX_SETS_PER_REQUEST + 1))
