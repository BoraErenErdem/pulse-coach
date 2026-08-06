from dataclasses import dataclass
from datetime import date as date_type, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.progress_log import ProgressLog

VALID_WORKOUT_TYPES = {"kuvvet", "kardiyo", "esneklik", "karışık"}


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

    def as_text(self) -> str:
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
        raise ValueError(f"Geçersiz antrenman türü: {workout_type}")

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


def list_progress_logs(db: Session, user_id: int, days: int | None = None) -> list[ProgressLog]:
    """Kullanıcının ilerleme kayıtlarını tarih sırasıyla döndürür (grafik/tablo için).
    `days` verilirse sadece son o kadar günü, verilmezse tüm geçmişi döndürür."""
    query = db.query(ProgressLog).filter(ProgressLog.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(ProgressLog.log_date >= since)
    return query.order_by(ProgressLog.log_date.asc()).all()


def calculate_weekly_streak(db: Session, user_id: int, today: date_type | None = None) -> int:
    """Bu hafta dahil, kullanıcının en az bir ilerleme kaydı (kilo ya da
    antrenman) girdiği kaç hafta ÜST ÜSTE (geriye doğru, kesintisiz) devam
    ettiğini hesaplar. Hafta sınırı Pazartesi-Pazar (ISO hafta). Son 52
    haftalık pencereyle sınırlı - daha eskisi zaten streak'i bozmuş demektir,
    tüm geçmişi taramaya gerek yok."""
    today = today or datetime.now(timezone.utc).date()
    since = today - timedelta(weeks=52)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .all()
    )
    if not logs:
        return 0

    def week_start(d: date_type) -> date_type:
        return d - timedelta(days=d.weekday())

    logged_weeks = {week_start(log.log_date) for log in logs}

    streak = 0
    cursor = week_start(today)
    while cursor in logged_weeks:
        streak += 1
        cursor -= timedelta(weeks=1)
    return streak


def generate_weekly_summary(db: Session, user_id: int) -> WeeklySummary:
    """Son 7 günün özetini döndürür. Hem Takip Agent tool'u hem de
    GET /progress/weekly-summary endpoint'i hem de haftalık scheduler job'ı bu
    fonksiyonu çağırır — tek iş mantığı katmanı."""
    since = datetime.now(timezone.utc).date() - timedelta(days=7)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .order_by(ProgressLog.log_date.asc())
        .all()
    )

    workout_logs = [log for log in logs if log.workout_completed]
    workout_types: dict[str, int] = {}
    for log in workout_logs:
        if log.workout_type:
            workout_types[log.workout_type] = workout_types.get(log.workout_type, 0) + 1

    weight_logs = [log for log in logs if log.weight is not None]
    weight_start = weight_logs[0].weight if weight_logs else None
    weight_end = weight_logs[-1].weight if weight_logs else None
    weight_trend = (
        weight_end - weight_start if weight_start is not None and weight_end is not None else None
    )

    return WeeklySummary(
        log_count=len({log.log_date for log in logs}),
        workout_count=len(workout_logs),
        workout_types=workout_types,
        weight_start=weight_start,
        weight_end=weight_end,
        weight_trend=weight_trend,
        streak_weeks=calculate_weekly_streak(db, user_id),
    )
