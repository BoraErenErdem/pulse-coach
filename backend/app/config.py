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
    access_token_expire_minutes: int = 60 * 24

    # LLM (Ollama)
    ollama_base_url: str = "http://localhost:11434"
    llm_model_name: str = "gemma4:e4b"
    llm_num_predict: int = 1000  # üretilecek maksimum token sayısı (yanıt süresini sınırlar)
    llm_keep_alive: str = "10m"  # model VRAM'de ne kadar süre yüklü kalsın
    embedding_model_name: str = "nomic-embed-text"

    # RAG
    faiss_index_path: str = "./faiss_index"
    knowledge_base_path: str = "./knowledge_base"

    # Scheduler (proaktif check-in)
    scheduler_enabled: bool = True
    weekly_checkin_day_of_week: str = "sun"
    weekly_checkin_hour: int = 20
    weekly_checkin_minute: int = 0


@lru_cache
def get_settings() -> Settings:
    return Settings()
