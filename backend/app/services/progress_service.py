from dataclasses import dataclass
from datetime import date as date_type, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.progress_log import ProgressLog
from app.models.workout_session import WorkoutSession

VALID_WORKOUT_TYPES = {"kuvvet", "kardiyo", "esneklik", "karışık"}

# DB'deki antrenman türü anahtarları HER ZAMAN Türkçe (bkz. VALID_WORKOUT_TYPES) -
# bu sadece as_text(language="en") çıktısında görünen etikette kullanılır,
# frontend'deki WORKOUT_TYPE_LABELS ile aynı çeviri (bkz. web/mobile ui.tsx).
_WORKOUT_TYPE_LABELS_EN = {
    "kuvvet": "Strength",
    "kardiyo": "Cardio",
    "esneklik": "Flexibility",
    "karışık": "Mixed",
}


@dataclass
class WeeklySummary:
    # Bu hafta en az bir ilerleme kaydı (kilo/antrenman) girilmiş GÜN sayısı -
    # ham satır sayısı DEĞİL (2026-08-06'da mobil canlı testinde bulundu: aynı
    # gün birden fazla kilo girişi eskiden log_count'u yanıltıcı şekilde
    # şişiriyordu, ör. aynı gün 3 kez kilo girmek "3 kayıt" gösteriyordu).
    # Bu, streak'in "gün/hafta bazlı" mantığıyla ve WeightChart'ın aynı-gün
    # dedup kararıyla tutarlı - kullanıcı kararı: kaç KEZ değil, kaç GÜN.
    log_count: int
    workout_count: int
    workout_types: dict[str, int]
    weight_start: float | None
    weight_end: float | None
    weight_trend: float | None
    # Bu hafta dahil, en az bir ilerleme kaydı (kilo/antrenman) girilmiş kaç
    # hafta ÜST ÜSTE kesintisiz devam ediyor (bkz. calculate_weekly_streak) -
    # rekabet analizinden gelen "streak" önerisi, mevcut progress_logs
    # verisinden türetiliyor, yeni bir tablo gerekmiyor.
    streak_weeks: int = 0

    def as_text(self, language: str = "tr") -> str:
        """`language`: SADECE kullanıcıya GÖSTERİLEN metnin dilini seçer
        (bkz. UserProfile.preferred_language) - agent tool çağrıları bu
        parametreyi hiç vermez (varsayılan "tr"), çünkü onların çıktısı
        Türkçe-konuşan orchestrator LLM'ine bağlam olarak gidiyor, kullanıcıya
        doğrudan gösterilmiyor (Faz 3'ün henüz yapılmayan kapsamı)."""
        if language == "en":
            return self._as_text_en()
        return self._as_text_tr()

    def _as_text_tr(self) -> str:
        if self.log_count == 0:
            return "Son 7 günde herhangi bir ilerleme kaydı girilmemiş."

        parts = [f"Son 7 günde {self.workout_count} antrenman kaydedilmiş."]
        if self.workout_types:
            breakdown = ", ".join(f"{name}: {count}" for name, count in self.workout_types.items())
            parts.append(f"Antrenman türü dağılımı: {breakdown}.")
        if self.weight_start is not None and self.weight_end is not None:
            if self.weight_trend and self.weight_trend > 0:
                direction = f"{self.weight_trend:.1f} kg artmış"
            elif self.weight_trend and self.weight_trend < 0:
                direction = f"{abs(self.weight_trend):.1f} kg azalmış"
            else:
                direction = "değişmemiş"
            parts.append(
                f"Kilo {self.weight_start:.1f} kg'dan {self.weight_end:.1f} kg'a, yani {direction}."
            )
        if self.streak_weeks >= 2:
            parts.append(f"Üst üste {self.streak_weeks}. haftandır düzenli kayıt giriyorsun, harika gidiyor!")
        return " ".join(parts)

    def _as_text_en(self) -> str:
        if self.log_count == 0:
            return "No progress was logged in the last 7 days."

        parts = [f"You logged {self.workout_count} workouts in the last 7 days."]
        if self.workout_types:
            breakdown = ", ".join(
                f"{_WORKOUT_TYPE_LABELS_EN.get(name, name)}: {count}" for name, count in self.workout_types.items()
            )
            parts.append(f"Workout type breakdown: {breakdown}.")
        if self.weight_start is not None and self.weight_end is not None:
            if self.weight_trend and self.weight_trend > 0:
                direction = f"up {self.weight_trend:.1f} kg"
            elif self.weight_trend and self.weight_trend < 0:
                direction = f"down {abs(self.weight_trend):.1f} kg"
            else:
                direction = "unchanged"
            parts.append(f"Weight went from {self.weight_start:.1f} kg to {self.weight_end:.1f} kg, {direction}.")
        if self.streak_weeks >= 2:
            parts.append(f"You've logged consistently for {self.streak_weeks} weeks in a row, great job!")
        return " ".join(parts)


def log_progress(
    db: Session,
    user_id: int,
    weight: float | None = None,
    workout_completed: bool | None = None,
    workout_type: str | None = None,
    log_date: date_type | None = None,
) -> ProgressLog:
    """Kilo ve/veya antrenman kaydı ekler. Hem Takip Agent tool'u hem de
    POST /progress/log endpoint'i bu fonksiyonu çağırır — tek iş mantığı katmanı."""
    if workout_type is not None and workout_type not in VALID_WORKOUT_TYPES:
        raise AppValidationError("invalid_workout_type", workout_type=workout_type)

    entry = ProgressLog(
        user_id=user_id,
        weight=weight,
        workout_completed=bool(workout_completed),
        workout_type=workout_type if workout_completed else None,
        log_date=log_date or datetime.now(timezone.utc).date(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_latest_weight(db: Session, user_id: int) -> float | None:
    """Kullanıcının en son kaydettiği kilo değerini döner (yoksa None) -
    kardiyo/esneklik kalori tahmininde (workout_service.py) kullanılıyor.
    Aynı gün birden fazla kilo girişi olabildiği için (bkz. WeightChart
    dedup kararı) tarihe göre DEĞİL id'ye göre en son eklenen satır esas
    alınıyor - tutarlı bir "en güncel" tanımı."""
    entry = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.weight.isnot(None))
        .order_by(ProgressLog.id.desc())
        .first()
    )
    return entry.weight if entry is not None else None


def list_progress_logs(db: Session, user_id: int, days: int | None = None) -> list[ProgressLog]:
    """Kullanıcının ilerleme kayıtlarını tarih sırasıyla döndürür (grafik/tablo için).
    `days` verilirse sadece son o kadar günü, verilmezse tüm geçmişi döndürür."""
    query = db.query(ProgressLog).filter(ProgressLog.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(ProgressLog.log_date >= since)
    return query.order_by(ProgressLog.log_date.asc()).all()


def calculate_weekly_streak(db: Session, user_id: int, today: date_type | None = None) -> int:
    """Bu hafta dahil, kullanıcının en az bir ilerleme kaydı (kilo,
    ProgressLog üzerinden basit antrenman işareti, ya da Antrenman
    sekmesinden detaylı bir WorkoutSession) girdiği kaç hafta ÜST ÜSTE
    (geriye doğru, kesintisiz) devam ettiğini hesaplar. Hafta sınırı
    Pazartesi-Pazar (ISO hafta). Son 52 haftalık pencereyle sınırlı - daha
    eskisi zaten streak'i bozmuş demektir, tüm geçmişi taramaya gerek yok.

    2026-08-06: WorkoutSession BİRLEŞİMİ eklendi - trend_service.py'deki
    generate_weekly_trends AYNI sınıf sorunu (antrenman iki ayrı yoldan
    kaydedilebiliyor) `workout_days` için daha önce düzeltmişti ama burası
    düzeltilmemiş kalmıştı. İlerleme sekmesinden "bugün antrenman yaptım"
    checkbox'ı kaldırılınca (Faz B) bu düzeltme olmadan Antrenman
    sekmesinden loglayan bir kullanıcının serisi sessizce sıfırda kalırdı."""
    today = today or datetime.now(timezone.utc).date()
    since = today - timedelta(weeks=52)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .all()
    )
    workout_sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date >= since)
        .all()
    )
    if not logs and not workout_sessions:
        return 0

    def week_start(d: date_type) -> date_type:
        return d - timedelta(days=d.weekday())

    logged_weeks = {week_start(log.log_date) for log in logs} | {
        week_start(session.session_date) for session in workout_sessions
    }

    streak = 0
    cursor = week_start(today)
    while cursor in logged_weeks:
        streak += 1
        cursor -= timedelta(weeks=1)
    return streak


def generate_weekly_summary(db: Session, user_id: int) -> WeeklySummary:
    """Son 7 günün özetini döndürür. Hem Takip Agent tool'u hem de
    GET /progress/weekly-summary endpoint'i hem de haftalık scheduler job'ı bu
    fonksiyonu çağırır — tek iş mantığı katmanı.

    2026-08-06: antrenman günü/türü artık ProgressLog.workout_completed
    VEYA WorkoutSession (Antrenman sekmesi) - hangisinden geldiğine
    bakılmaksızın BİRLEŞİM olarak sayılıyor (calculate_weekly_streak'teki
    aynı düzeltme, aynı gerekçe)."""
    since = datetime.now(timezone.utc).date() - timedelta(days=7)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .order_by(ProgressLog.log_date.asc())
        .all()
    )
    workout_sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date >= since)
        .all()
    )

    workout_days_from_logs = {log.log_date for log in logs if log.workout_completed}
    workout_days_from_sessions = {session.session_date for session in workout_sessions}
    workout_days = workout_days_from_logs | workout_days_from_sessions

    workout_types: dict[str, int] = {}
    for log in logs:
        if log.workout_completed and log.workout_type:
            workout_types[log.workout_type] = workout_types.get(log.workout_type, 0) + 1
    for session in workout_sessions:
        if session.workout_type:
            workout_types[session.workout_type] = workout_types.get(session.workout_type, 0) + 1

    weight_logs = [log for log in logs if log.weight is not None]
    weight_start = weight_logs[0].weight if weight_logs else None
    weight_end = weight_logs[-1].weight if weight_logs else None
    weight_trend = (
        weight_end - weight_start if weight_start is not None and weight_end is not None else None
    )

    active_days = {log.log_date for log in logs} | workout_days_from_sessions

    return WeeklySummary(
        log_count=len(active_days),
        workout_count=len(workout_days),
        workout_types=workout_types,
        weight_start=weight_start,
        weight_end=weight_end,
        weight_trend=weight_trend,
        streak_weeks=calculate_weekly_streak(db, user_id),
    )
