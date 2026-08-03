from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.workout_session import WorkoutSession
from app.services.mood_service import MOOD_LABELS

# zor=1, dusuk=2, notr=3, iyi=4, harika=5 - MOOD_LABELS'teki sıraya göre
# (dict insertion order Python 3.7+'te garanti, mood_service.py'deki MoodPicker
# ile aynı sıra).
MOOD_SCORES: dict[str, int] = {key: index + 1 for index, key in enumerate(MOOD_LABELS)}

# Korelasyon için anlamlı bir yorum yapabilmek adına en az bu kadar (hem mood
# hem egzersiz verisi olan) hafta gerekiyor - küçük örneklemde yanıltıcı bir
# "korelasyon" iddia etmemek için.
MIN_WEEKS_FOR_CORRELATION = 4


@dataclass
class WeeklyTrendPoint:
    week_start: date_type
    avg_mood_score: float | None
    mood_log_count: int
    workout_days: int
    avg_daily_calories: float | None
    weight_end: float | None


def _week_start(d: date_type) -> date_type:
    return d - timedelta(days=d.weekday())


def generate_weekly_trends(db: Session, user_id: int, weeks: int = 12) -> list[WeeklyTrendPoint]:
    """Son `weeks` hafta için mood/beslenme/egzersiz/kilo özetini haftalık
    noktalar halinde döner - trend grafiği ve basit korelasyon analizi için.
    Hafta sınırı Pazartesi-Pazar (ISO hafta), progress_service.
    calculate_weekly_streak ile aynı desen."""
    today = datetime.now(timezone.utc).date()
    since = _week_start(today) - timedelta(weeks=weeks - 1)

    mood_logs = db.query(MoodLog).filter(MoodLog.user_id == user_id, MoodLog.log_date >= since).all()
    meal_entries = db.query(MealEntry).filter(MealEntry.user_id == user_id, MealEntry.log_date >= since).all()
    # Egzersiz İKİ ayrı yoldan kaydedilebiliyor: detaylı set/tekrar bazlı
    # WorkoutSession (Antrenman sayfası/workout_tracking_agent) VE basit
    # "bugün antrenman yaptım" bayrağı olan ProgressLog.workout_completed
    # (İlerleme sayfası/tracking_agent) - "antrenman günü" ikisinin BİRLEŞİMİ
    # sayılmalı, sadece biri kullanılırsa diğer yoldan kaydedenler kaçırılır.
    workout_sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date >= since)
        .all()
    )
    progress_logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .order_by(ProgressLog.log_date.asc())
        .all()
    )
    weight_logs = [log for log in progress_logs if log.weight is not None]

    points: list[WeeklyTrendPoint] = []
    for week_index in range(weeks):
        week_start = since + timedelta(weeks=week_index)
        week_end = week_start + timedelta(days=6)

        week_moods = [
            MOOD_SCORES[log.mood_key] for log in mood_logs if week_start <= log.log_date <= week_end
        ]
        week_calorie_days: dict[date_type, float] = {}
        for entry in meal_entries:
            if week_start <= entry.log_date <= week_end:
                week_calorie_days[entry.log_date] = (
                    week_calorie_days.get(entry.log_date, 0.0) + entry.calories_kcal
                )
        week_workout_days = {
            session.session_date for session in workout_sessions if week_start <= session.session_date <= week_end
        } | {
            log.log_date
            for log in progress_logs
            if log.workout_completed and week_start <= log.log_date <= week_end
        }
        week_weights = [log.weight for log in weight_logs if week_start <= log.log_date <= week_end]

        points.append(
            WeeklyTrendPoint(
                week_start=week_start,
                avg_mood_score=sum(week_moods) / len(week_moods) if week_moods else None,
                mood_log_count=len(week_moods),
                workout_days=len(week_workout_days),
                avg_daily_calories=(
                    sum(week_calorie_days.values()) / len(week_calorie_days) if week_calorie_days else None
                ),
                weight_end=week_weights[-1] if week_weights else None,
            )
        )
    return points


def mood_workout_correlation(points: list[WeeklyTrendPoint]) -> float | None:
    """Egzersiz yapılan gün sayısı ile o haftaki ortalama ruh hali skoru
    arasındaki Pearson korelasyon katsayısını (-1..1) döner.
    MIN_WEEKS_FOR_CORRELATION'dan az veri noktası varsa (ya da varyans sıfırsa)
    None döner - istatistiksel olarak anlamsız/yanıltıcı bir sayı üretmemek
    için sessizce atlanır, LLM ya da UI bunu "yeterli veri yok" olarak
    yorumlamalı."""
    paired = [(p.workout_days, p.avg_mood_score) for p in points if p.avg_mood_score is not None]
    if len(paired) < MIN_WEEKS_FOR_CORRELATION:
        return None

    xs = [x for x, _ in paired]
    ys = [y for _, y in paired]
    n = len(paired)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    covariance = sum((x - mean_x) * (y - mean_y) for x, y in paired)
    std_x = sum((x - mean_x) ** 2 for x in xs) ** 0.5
    std_y = sum((y - mean_y) ** 2 for y in ys) ** 0.5
    if std_x == 0 or std_y == 0:
        return None
    return covariance / (std_x * std_y)
