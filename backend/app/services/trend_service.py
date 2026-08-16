from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.workout_session import WorkoutSession
from app.services.mood_service import MOOD_LABELS, list_mood_history

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


# --- Ruh Hali İçgörüsü (2026-08-16, kullanıcı isteği) ---
# Ruh Hali Geçmişi ekranına "kural-tabanlı istatistik + LLM ile yumuşatma"
# içgörü kartı eklemek için: bu modül SADECE iki muhafazakâr sinyali
# (haftalık eğilim + haftanın-günü örüntüsü) hesaplar, ikisi de zayıfsa
# `None` döner - kart hiç görünmez (get_body_composition_insight'taki AYNI
# "her açılışta bir şey söyleme" felsefesi). Metne çevirme/LLM ile yumuşatma
# motivation_agent.render_mood_insight()'ta, döngüsel import'tan kaçınmak
# için BİLEREK ayrı bir modülde.
TREND_DELTA_THRESHOLD = 0.4
MIN_WEEKDAY_OCCURRENCES = 3
WEEKDAY_DEVIATION_THRESHOLD = 0.6
_WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


@dataclass
class MoodInsightStats:
    trend_direction: str | None  # "improving" | "declining" | None (sinyal yok)
    recent_avg: float | None
    previous_avg: float | None
    weekday_key: str | None  # _WEEKDAY_KEYS'ten biri, ya da None (sinyal yok)
    weekday_avg: float | None
    overall_avg: float | None


def _compute_trend_direction(
    points: list[WeeklyTrendPoint],
) -> tuple[str | None, float | None, float | None]:
    """Veri içeren en son 2 hafta ortalamasını, öncesindeki veri içeren
    haftaların ortalamasıyla kıyaslar. Karşılaştırılacak yeterli hafta yoksa
    (en az 1 önceki + 2 son) ya da fark eşiğin altındaysa (istatistiksel
    gürültü, "stabil" diye ayrıca bir şey söylemiyoruz) yön `None` döner."""
    data_weeks = [p for p in points if p.avg_mood_score is not None]
    if len(data_weeks) < 2:
        return None, None, None
    recent = data_weeks[-2:]
    previous = data_weeks[-4:-2]
    if not previous:
        return None, None, None
    recent_avg = sum(p.avg_mood_score for p in recent) / len(recent)
    previous_avg = sum(p.avg_mood_score for p in previous) / len(previous)
    delta = recent_avg - previous_avg
    if abs(delta) < TREND_DELTA_THRESHOLD:
        return None, recent_avg, previous_avg
    return ("improving" if delta > 0 else "declining"), recent_avg, previous_avg


def _compute_weekday_pattern(logs: list[MoodLog]) -> tuple[str | None, float | None, float | None]:
    """Son N gündeki (çağıran belirler) kayıtları haftanın gününe göre
    gruplar, genel ortalamadan en çok sapan günü bulur. En az
    MIN_WEEKDAY_OCCURRENCES kaydı olmayan bir gün hiç değerlendirilmez
    (küçük örneklemde yanıltıcı bir örüntü iddia etmemek için), sapma
    WEEKDAY_DEVIATION_THRESHOLD'un altındaysa da `None` döner."""
    if not logs:
        return None, None, None
    scores = [MOOD_SCORES[log.mood_key] for log in logs]
    overall_avg = sum(scores) / len(scores)

    by_weekday: dict[int, list[int]] = {}
    for log in logs:
        by_weekday.setdefault(log.log_date.weekday(), []).append(MOOD_SCORES[log.mood_key])

    best_key: str | None = None
    best_avg: float | None = None
    best_deviation = 0.0
    for weekday_index, weekday_scores in by_weekday.items():
        if len(weekday_scores) < MIN_WEEKDAY_OCCURRENCES:
            continue
        weekday_avg = sum(weekday_scores) / len(weekday_scores)
        deviation = abs(weekday_avg - overall_avg)
        if deviation > best_deviation:
            best_deviation = deviation
            best_key = _WEEKDAY_KEYS[weekday_index]
            best_avg = weekday_avg

    if best_key is None or best_deviation < WEEKDAY_DEVIATION_THRESHOLD:
        return None, None, overall_avg
    return best_key, best_avg, overall_avg


def compute_mood_insight_stats(db: Session, user_id: int) -> MoodInsightStats | None:
    """Ruh Hali içgörü kartı için kural-tabanlı istatistikleri hesaplar.
    Yeni bir sorgu YAZMIYOR - mevcut generate_weekly_trends (haftalık eğilim
    için) ve mood_service.list_mood_history (haftanın-günü örüntüsü için, son
    60 gün) yeniden kullanılıyor. Her iki sinyal de zayıfsa `None` döner -
    çağıran (motivation_agent) bu durumda hiç LLM çağrısı yapmamalı, frontend
    kartı hiç göstermemeli."""
    points = generate_weekly_trends(db, user_id, weeks=8)
    trend_direction, recent_avg, previous_avg = _compute_trend_direction(points)

    logs = list_mood_history(db, user_id, days=60)
    weekday_key, weekday_avg, overall_avg = _compute_weekday_pattern(logs)

    if trend_direction is None and weekday_key is None:
        return None

    return MoodInsightStats(
        trend_direction=trend_direction,
        recent_avg=recent_avg,
        previous_avg=previous_avg,
        weekday_key=weekday_key,
        weekday_avg=weekday_avg,
        overall_avg=overall_avg,
    )
