"""Profil sekmesindeki "Başarıların" şeridi (2026-09-25).

Yeni veri TOPLAMAZ - mevcut kayıtlardan tüm zamanlar için birkaç sayaç
türetir ve sabit eşiklerle rozetlere çevirir. Rozet metinleri istemcide
(TR/EN); backend yalnızca anahtar, ölçüt, eşik ve güncel değeri döner.

En uzun seri, `progress_service.is_day_complete` ile AYNI kurala göre (o gün
ruh hali girilmiş + kalori hedefi varsa ±%20 içinde) ama gün gün sorgu yerine
tek seferde çekilen ruh hali tarihleri ve günlük kalori toplamlarıyla bellekte
hesaplanır. Kalori hedefi olarak güncel hedef kullanılır - güncel seri
(`calculate_daily_streak`) de böyle."""

from dataclasses import dataclass
from datetime import date as date_type
from datetime import timedelta

from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.workout_session import WorkoutSession
from app.services import exercise_goal_service, profile_service

# (anahtar, ölçüt, eşik) - sıra istemcideki gösterim sırasıdır.
BADGES: tuple[tuple[str, str, int], ...] = (
    ("first_workout", "workout_days", 1),
    ("streak_3", "longest_streak", 3),
    ("goal_reached", "goals_reached", 1),
    ("mood_14", "mood_days", 14),
    ("workouts_10", "workout_days", 10),
    ("streak_7", "longest_streak", 7),
    ("meals_30", "meal_days", 30),
    ("workouts_50", "workout_days", 50),
    ("streak_30", "longest_streak", 30),
)


@dataclass
class Badge:
    key: str
    metric: str
    threshold: int
    current: int
    earned: bool


@dataclass
class Achievements:
    workout_days: int
    mood_days: int
    meal_days: int
    longest_streak: int
    goals_reached: int
    badges: list[Badge]


def _longest_run(days: list[date_type]) -> int:
    longest = run = 0
    previous: date_type | None = None
    for day in sorted(days):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day
    return longest


def longest_daily_streak(db: Session, user_id: int) -> int:
    mood_dates = {row[0] for row in db.query(MoodLog.log_date).filter(MoodLog.user_id == user_id).all()}
    if not mood_dates:
        return 0
    profile = profile_service.get_profile(db, user_id)
    calorie_goal = profile.daily_calorie_goal if profile else None
    if not calorie_goal:
        return _longest_run(list(mood_dates))
    rows = (
        db.query(MealEntry.log_date, func.sum(MealEntry.calories_kcal))
        .filter(MealEntry.user_id == user_id)
        .group_by(MealEntry.log_date)
        .all()
    )
    totals: dict[date_type, float] = {row[0]: float(row[1] or 0) for row in rows}
    lower, upper = calorie_goal * 0.8, calorie_goal * 1.2
    complete = [day for day in mood_dates if lower <= totals.get(day, 0.0) <= upper]
    return _longest_run(complete)


def _distinct_days(db: Session, column, user_column, user_id: int) -> int:
    return db.query(func.count(distinct(column))).filter(user_column == user_id).scalar() or 0


def get_achievements(db: Session, user_id: int) -> Achievements:
    metrics = {
        "workout_days": _distinct_days(db, WorkoutSession.session_date, WorkoutSession.user_id, user_id),
        "mood_days": _distinct_days(db, MoodLog.log_date, MoodLog.user_id, user_id),
        "meal_days": _distinct_days(db, MealEntry.log_date, MealEntry.user_id, user_id),
        "longest_streak": longest_daily_streak(db, user_id),
        "goals_reached": sum(
            1 for goal in exercise_goal_service.list_exercise_goal_progress(db, user_id) if goal.progress_pct >= 100
        ),
    }
    badges = [
        Badge(key=key, metric=metric, threshold=threshold, current=metrics[metric], earned=metrics[metric] >= threshold)
        for key, metric, threshold in BADGES
    ]
    return Achievements(badges=badges, **metrics)
