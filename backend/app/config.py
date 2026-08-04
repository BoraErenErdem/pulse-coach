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
    # gemma4:e4b, Ollama'nın 'vision' capability'si listelemesine rağmen bu
    # makinede fotoğrafları hiç işlemiyor (gerçek foto ile canlı test edildi,
    # temiz yeniden indirme de düzeltmedi) — fotoğraf analizinde SADECE bu
    # ayrı model kullanılıyor, sohbetin geri kalanı llm_model_name'de kalıyor.
    # gemma3:4b vs gemma4:12b karşılaştırması (2026-08-01, 3 gerçek yemek
    # fotoğrafıyla): gemma4:12b pişirme durumu tespitinde (çiğ/haşlanmış/
    # fırınlanmış — kalori hesabını doğrudan etkiliyor) ve besin türü
    # doğruluğunda (ör. kuşkonmazı "brokoli sapları" diye yanlış tanımlama,
    # yaban mersinini "ahududu" sanma gibi gemma3:4b hataları) belirgin
    # şekilde daha isabetli çıktı; hız farkı ısındıktan sonra kabul edilebilir
    # (~6.5sn vs ~4.5sn). gemma3:4b kaldırılmadı, gerekirse fallback/kıyaslama
    # için diskte duruyor.
    photo_vision_model_name: str = "gemma4:12b"

    # USDA FoodData Central (besin kataloğu toplu içe aktarımı için, .env'de
    # tutuluyor — gitignore'lu, repoya girmiyor)
    usda_api_key: str | None = None

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

    # Veritabanı yedekleme (aynı scheduler_enabled flag'iyle kontrol edilen
    # ayrı bir job - bkz. app/services/backup_service.py). Düşük kullanım
    # saatinde (varsayılan gece 03:00) günlük tetiklenir, backend'in
    # health_coach.db'nin yanındaki backups/ klasörüne SQLite'ın kendi online
    # backup API'siyle tutarlı bir kopya alır.
    backup_hour: int = 3
    backup_max_to_keep: int = 14

    # rate_limit_attempts satırları sadece WINDOW_MINUTES (15dk) boyunca
    # sayaca dahil edilir (bkz. auth/rate_limit.py) - bu süreden eskisi zaten
    # işlevsiz, sadece tablo boyutunu şişiriyor. Backup'tan sonra, aynı düşük
    # kullanım saatinde günlük temizlenir.
    rate_limit_attempt_retention_days: int = 7

    # meal_photos galerisi için kullanıcı başına retention - foto BLOB'ları
    # SQLite'da tutulduğundan (bkz. app/models/meal_photo.py) sınırsız
    # birikim DB dosyasını ve backup süresini şişirir. İki sınır da bağımsız
    # uygulanır (hangisi önce tetiklenirse o siler): kullanıcı başına en
    # fazla N foto tutulur VE N aydan eskisi silinir.
    meal_photo_retention_count: int = 200
    meal_photo_retention_months: int = 12

    # CORS - virgülle ayrılmış origin listesi. Varsayılan sadece Next.js dev
    # sunucusu; mobil (Expo Web/PWA) veya prod origin'i eklenecekse .env'de
    # CORS_ALLOWED_ORIGINS="http://localhost:3000,https://app.example.com" gibi
    # üzerine yazılabilir - kod değişikliği gerekmez.
    cors_allowed_origins: str = "http://localhost:3000"

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
