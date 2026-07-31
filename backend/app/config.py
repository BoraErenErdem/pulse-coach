from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Database
    database_url: str = "sqlite:///./health_coach.db"

    # Auth / JWT
    jwt_secret_key: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    # Kısa ömürlü - asıl oturum süresi refresh_token_expire_days'ten geliyor,
    # access_token sadece kısa vadeli bir yetki belgesi (bkz. refresh_token_service).
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 60

    # E-posta (şifre sıfırlama linki için). smtp_host boş bırakılırsa
    # email_service gerçek gönderim YAPMAZ, linki sadece log'a yazar (dev
    # modu) - bkz. app/services/email_service.py.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "noreply@pulsecoach.local"
    frontend_base_url: str = "http://localhost:3000"

    # LLM (Ollama)
    ollama_base_url: str = "http://localhost:11434"
    llm_model_name: str = "gemma4:e4b"
    # üretilecek maksimum token sayısı. reasoning=True ile model önce görünmeyen
    # "düşünme" token'ları üretiyor; karmaşık/çok setli mesajlarda (ör. tek
    # mesajda 8 egzersiz + birden fazla öğün) bu düşünme + bulk tool-call JSON'ı
    # eskiden 1000 token'a sığmıyordu ve model done_reason=length ile boş
    # content üretiyordu (bkz. diag6.py: aynı mesaj 4000'de done_reason=stop,
    # eval_count=2627 ile başarıyla tamamlandı).
    llm_num_predict: int = 4000
    llm_keep_alive: str = "10m"  # model VRAM'de ne kadar süre yüklü kalsın
    embedding_model_name: str = "nomic-embed-text"

    # RAG
    faiss_index_path: str = "./faiss_index"
    knowledge_base_path: str = "./knowledge_base"

    # Antrenman/beslenme katalog verisi (seed script'leri için)
    data_sources_path: str = "./data_sources"

    # Scheduler (proaktif check-in)
    scheduler_enabled: bool = True
    weekly_checkin_day_of_week: str = "sun"
    weekly_checkin_hour: int = 20
    weekly_checkin_minute: int = 0


@lru_cache
def get_settings() -> Settings:
    return Settings()
