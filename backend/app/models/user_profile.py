from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    goal: Mapped[str | None] = mapped_column(String, nullable=True)  # weight_loss / muscle_gain / general_health
    activity_level: Mapped[str | None] = mapped_column(String, nullable=True)  # sedentary / light / moderate / active
    dietary_restrictions: Mapped[str | None] = mapped_column(String, nullable=True)  # free text / comma separated
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # İlerleme sekmesinde OPSİYONEL bel çevresi / vücut yağ oranı hedefleri
    # (2026-09-19): hedef kilo ile aynı mantık (başlangıçtan hedefe ilerleme),
    # aynı sınır kontrolleri (bkz. profile_service._validate_goal_numbers).
    target_waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_calorie_goal: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_protein_goal_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_carbs_goal_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_fat_goal_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    # "tr" / "en" — SADECE egzersiz/beslenme kataloğu görüntüleme dilini
    # etkiler (bkz. exercise_catalog_service/food_catalog_service canonical
    # isim seçimi). Sohbet/RAG/arayüz metinleri bu alandan ETKİLENMEZ, ayrı
    # bir fazın kapsamında (bkz. project_health_coach_status.md).
    # Haftada kaç GÜN antrenman hedefleniyor (1-7), None = hedef yok - bkz.
    # app/services/weekly_goal_service.py.
    weekly_workout_goal_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String, nullable=False, default="tr")
    # "sicak" / "enerjik" / "notr" - push bildirim + haftalık/günlük check-in
    # metinlerinin tonunu belirler (kullanıcının AÇIK seçimi, otomatik tahmin
    # DEĞİL). ASCII Türkçe anahtar - preferred_language gibi teknik bir
    # kategori değil, MoodLog.mood_key'e benzer bir kişilik/ton etiketi.
    coach_tone: Mapped[str | None] = mapped_column(String, nullable=True)
    # Profil sekmesi turu (2026-09-25): karşılamada e-postadan tahmin edilen ad
    # yerine kullanıcının isteğe bağlı girdiği görünen ad (KVKK: Kimlik/İletişim).
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Koç bildirim tercihleri: günlük hatırlatma / haftalık özet (e-posta + push
    # + Bildirimler kaydı) kapatılabilir; hatırlatma saati kullanıcının YEREL
    # saati (0-23), None = config varsayılanı (bkz. scheduler/jobs.py).
    daily_nudge_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    weekly_summary_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    daily_nudge_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="profile")
