from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Google/Apple ile kayıt olan kullanıcıların şifresi YOK (bkz. aşağıdaki
    # google_sub/apple_sub) - 2026-09-16'da NOT NULL'dan nullable'a geçirildi
    # (bkz. migration). E-posta/şifreyle kayıtlı TÜM mevcut kullanıcılarda
    # dolu kalıyor, sadece yeni OAuth-only hesaplarda None.
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    # OAuth sağlayıcısının kalıcı/değişmez kullanıcı kimliği ("sub" claim) -
    # e-posta değil bu alanla eşleştiriyoruz çünkü e-posta sağlayıcı
    # tarafında değişebilir, sub değişmez (Google/Apple'ın kendi garantisi).
    # unique+nullable: aynı Google hesabı iki farklı PulseCoach hesabına
    # bağlanamaz, ama parola ile kayıtlı kullanıcılarda ikisi de None kalır.
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    apple_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    # Expo push bildirim token'ı - tek kolon (last-device-wins, çoklu cihaz
    # senaryosu şimdilik gerekmiyor, YAGNI). Cihaz kayıtsız/izin verilmemişse
    # None - push_service bu durumda sessizce göndermeyi atlar.
    expo_push_token: Mapped[str | None] = mapped_column(String, nullable=True)
    # "Sohbeti Sıfırla" (bkz. conversation_service.soft_clear) - set
    # edilmişse bu tarihten ÖNCEKİ sohbet mesajları ne ekranda listelenir ne
    # de koçun bağlamına dahil edilir, ama silinmez (bkz. migration
    # c548aeceb05f).
    chat_cleared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # KVKK açık rıza kaydı (2026-09-11, bkz. migration 1a2c9e7b3f4d): register
    # sırasında ZORUNLU iki ayrı onay (bkz. schemas.user.UserCreate) - biri
    # genel Aydınlatma Metni + KVKK md.5 kapsamındaki veri işleme, diğeri
    # sağlık verisi gibi özel nitelikli veriler için md.6 açık rızası. İkisi
    # de ayrı checkbox/ayrı zaman damgası - "sağlık verisi rızası genel
    # rızadan bağımsız ve spesifik olmalı" ilkesi tek bir alana indirgenirse
    # kaybolur. Mevcut (bu alanlar eklenmeden önce kayıtlı) kullanıcılarda
    # NULL kalır - geriye dönük zorla re-consent akışı YOK (henüz).
    # consent_version: onay anında geçerli olan metnin sürümü (bkz.
    # user_service.CONSENT_VERSION) - metin ileride maddi değişirse hangi
    # kullanıcının hangi sürüme rıza verdiğini ayırt etmek için.
    kvkk_consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    health_data_consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Kullanım Koşulları kabulü (2026-09-14, bkz. migration f0b6d22042d0) -
    # KVKK rızalarından AYRI bir alan: biri kişisel veri işleme rızası
    # (KVKK'ya özgü), diğeri sözleşmesel kabul (Kullanım Koşulları, özellikle
    # tıbbi sorumluluk reddi maddesi) - ikisi farklı hukuki temellere dayanıyor
    # o yüzden bilinçli olarak ayrı tutuluyor, kvkk_consent_at'a birleştirilmedi.
    terms_consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    progress_logs = relationship("ProgressLog", back_populates="user", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    checkin_messages = relationship("CheckinMessage", back_populates="user", cascade="all, delete-orphan")
    workout_sessions = relationship("WorkoutSession", back_populates="user", cascade="all, delete-orphan")
    meal_entries = relationship("MealEntry", back_populates="user", cascade="all, delete-orphan")
    exercise_goals = relationship("ExerciseGoal", back_populates="user", cascade="all, delete-orphan")
    mood_logs = relationship("MoodLog", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    meal_photos = relationship("MealPhoto", back_populates="user", cascade="all, delete-orphan")
