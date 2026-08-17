from dataclasses import dataclass
from datetime import date as date_type
from datetime import timedelta
from sqlalchemy.orm import Session
from app.models.checkin_message import CheckinMessage
from app.models.meal_entry import MealEntry
from app.services import mood_service, profile_service, progress_service


@dataclass
class DailyNudgeSignals:
    mood_not_logged: bool
    meal_not_logged: bool
    streak_at_risk: bool

    def any_active(self) -> bool:
        return self.mood_not_logged or self.meal_not_logged or self.streak_at_risk


def is_on_cooldown(db: Session, user_id: int, today: date_type, cooldown_days: int) -> bool:
    """3 günlük cooldown - YENİ KOLON YOK, `CheckinMessage.generated_at`
    (kind="daily_nudge" filtreli) üzerinden türetilir. `kind` kolonu zaten
    Bildirimler ekranı birleşimi için ekleniyor, MAX(generated_at) cooldown
    durumunu sıfır ekstra şema ile veriyor - senkronize edilecek ayrı bir
    "last_sent_at" alanı yok, kendiliğinden temiz kalıyor."""
    last = (
        db.query(CheckinMessage)
        .filter(CheckinMessage.user_id == user_id, CheckinMessage.kind == "daily_nudge")
        .order_by(CheckinMessage.generated_at.desc())
        .first()
    )
    if last is None:
        return False
    return (today - last.generated_at.date()).days < cooldown_days


def collect_signals(db: Session, user_id: int, today: date_type) -> DailyNudgeSignals:
    """3 sinyali kontrol eder - hiçbiri true değilse hatırlatma
    gönderilmez (boş "her şey harika" spam'i üretilmez)."""
    mood_not_logged = mood_service.get_mood(db, user_id, log_date=today) is None

    profile = profile_service.get_profile(db, user_id)
    has_nutrition_goal = profile is not None and (
        profile.daily_calorie_goal is not None
        or profile.daily_protein_goal_g is not None
        or profile.daily_carbs_goal_g is not None
        or profile.daily_fat_goal_g is not None
    )
    meal_not_logged = False
    if has_nutrition_goal:
        meal_not_logged = (
            db.query(MealEntry)
            .filter(MealEntry.user_id == user_id, MealEntry.log_date == today)
            .first()
            is None
        )

    # "Seri risk altında" = (a) DÜNE kadar bir günlük seri vardı
    # (calculate_daily_streak(today=dün) > 0), (b) BUGÜN henüz tamamlanmadı
    # (is_day_complete=False). Job SABİT bir saatte çalıştığı için (bkz.
    # config.py::daily_nudge_hour, varsayılan 18:00) ayrı bir "güne
    # yaklaşılıyor" kapısına gerek YOK - zaten akşamüstü kontrol ediliyor
    # (eski haftalık tanımdaki `streak_risk_weekday` kapısının günlük
    # karşılığı, artık job'ın kendi sabit saatinde örtük olarak var).
    streak_before_today = progress_service.calculate_daily_streak(db, user_id, today=today - timedelta(days=1))
    today_incomplete = not progress_service.is_day_complete(db, user_id, today)
    streak_at_risk = streak_before_today > 0 and today_incomplete

    return DailyNudgeSignals(
        mood_not_logged=mood_not_logged,
        meal_not_logged=meal_not_logged,
        streak_at_risk=streak_at_risk,
    )
