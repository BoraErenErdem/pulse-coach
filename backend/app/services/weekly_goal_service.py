"""Haftalık antrenman hedefi (2026-09-23) - "haftada N gün antrenman".

Hafta kullanıcının YEREL takvimine göre Pazartesi-Pazar (uygulamanın geri
kalanındaki ISO hafta kuralı, bkz. workout_service._period_bounds/
trend_service) - "bugün" user_time.user_today ile, yani kullanıcının kendi saat
diliminde hesaplanır. "Antrenman günü" haftalık özetle (progress_service.
generate_weekly_summary) AYNI tanım: detaylı WorkoutSession VEYA İlerleme'den
işaretlenmiş ProgressLog.workout_completed - ikisinin birleşimi."""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.progress_log import ProgressLog
from app.models.workout_session import WorkoutSession
from app.services import profile_service
from app.services.user_time import user_today


@dataclass
class WeeklyGoalDay:
    day: date
    trained: bool


@dataclass
class WeeklyGoalProgress:
    goal_days: int | None
    done_days: int
    week_start: date
    today: date
    days: list[WeeklyGoalDay]

    @property
    def achieved(self) -> bool:
        return self.goal_days is not None and self.done_days >= self.goal_days

    def as_text(self) -> str:
        """Koça (sohbet aracı çıktısı) giden özet - Türkçe, bkz. exceptions.py'deki
        tool çıktısı dil notu."""
        if self.goal_days is None:
            return f"Kullanıcının haftalık antrenman günü hedefi yok. Bu hafta {self.done_days} gün antrenman yaptı."
        remaining_days_in_week = 6 - (self.today - self.week_start).days
        if self.achieved:
            return (
                f"Haftalık hedef TAMAMLANDI: bu hafta {self.done_days}/{self.goal_days} gün antrenman "
                "yapıldı - kutla."
            )
        return (
            f"Haftalık hedef: bu hafta {self.done_days}/{self.goal_days} gün antrenman yapıldı, "
            f"{self.goal_days - self.done_days} gün daha gerekiyor (haftanın bitmesine "
            f"{remaining_days_in_week} gün var)."
        )


def get_weekly_goal_progress(db: Session, user_id: int) -> WeeklyGoalProgress:
    today = user_today(db, user_id)
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    session_days = {
        row.session_date
        for row in db.query(WorkoutSession.session_date).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_date >= week_start,
            WorkoutSession.session_date <= week_end,
        )
    }
    logged_days = {
        row.log_date
        for row in db.query(ProgressLog.log_date).filter(
            ProgressLog.user_id == user_id,
            ProgressLog.workout_completed.is_(True),
            ProgressLog.log_date >= week_start,
            ProgressLog.log_date <= week_end,
        )
    }
    trained_days = session_days | logged_days

    profile = profile_service.get_profile(db, user_id)
    return WeeklyGoalProgress(
        goal_days=profile.weekly_workout_goal_days if profile is not None else None,
        done_days=len(trained_days),
        week_start=week_start,
        today=today,
        days=[
            WeeklyGoalDay(day=week_start + timedelta(days=i), trained=week_start + timedelta(days=i) in trained_days)
            for i in range(7)
        ],
    )
