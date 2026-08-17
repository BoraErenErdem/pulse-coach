from datetime import date
from pydantic import BaseModel, ConfigDict


class ProgressLogCreate(BaseModel):
    weight: float | None = None
    waist_cm: float | None = None
    body_fat_pct: float | None = None
    workout_completed: bool = False
    workout_type: str | None = None


class ProgressLogUpdate(BaseModel):
    # 2026-08-11 kullanıcı bulgusu: yanlış girilen bir kilo/bel/yağ oranı
    # kaydını düzeltmenin HİÇ yolu yoktu (Antrenman/Beslenme kayıtlarının
    # aksine). Sadece bu 3 alan düzenlenebilir - workout_completed/
    # workout_type bu ekranda zaten kullanıcıya gösterilmiyor (Faz B'de
    # kaldırılan checkbox, bkz. progress.tsx yorumu), düzenleme kapsamı
    # dışında tutuldu.
    weight: float | None = None
    waist_cm: float | None = None
    body_fat_pct: float | None = None


class ProgressLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weight: float | None
    waist_cm: float | None
    body_fat_pct: float | None
    workout_completed: bool
    workout_type: str | None
    log_date: date


class WeeklySummaryRead(BaseModel):
    log_count: int
    workout_count: int
    workout_types: dict[str, int]
    weight_start: float | None
    weight_end: float | None
    weight_trend: float | None
    streak_days: int
    summary_text: str


class WeeklyTrendPointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    week_start: date
    avg_mood_score: float | None
    mood_log_count: int
    workout_days: int
    avg_daily_calories: float | None
    weight_end: float | None


class TrendsRead(BaseModel):
    points: list[WeeklyTrendPointRead]
    mood_workout_correlation: float | None


class BodyCompositionInsightRead(BaseModel):
    # message None ise (yeterli veri yok/anlamlı bir sapma yok) frontend
    # kartı hiç göstermez - bkz. progress_service.py::get_body_composition_insight.
    message: str | None
