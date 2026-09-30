"""Hazırlık kontrolü (2026-09-30) - dış uptime izleyicisi GET /health/ready'yi
yoklar. /health yalnız "süreç ayakta" der; bu kontrol ise kullanıcının gerçekten
koçla konuşabileceğini doğrular: veritabanı, Ollama ve gereken modeller, bir de
yedeklemenin durmadığı (sessizce duran yedek, veri kaybı yaşanana kadar fark
edilmez). Yanıt yalnız ok/fail içerir - iç ayrıntı (hata metni, model listesi)
dışarı verilmez, loglanır."""

import logging
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services import backup_service

logger = logging.getLogger(__name__)

_OLLAMA_TIMEOUT_S = 3.0


def _check_database(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Hazırlık: veritabanına erişilemedi")
        return False


def _required_models() -> set[str]:
    settings = get_settings()
    return {settings.llm_model_name, settings.photo_vision_model_name, settings.embedding_model_name}


def _normalize_model(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


def _check_llm() -> bool:
    settings = get_settings()
    try:
        response = requests.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags", timeout=_OLLAMA_TIMEOUT_S)
        response.raise_for_status()
        available = {_normalize_model(m.get("name", "")) for m in response.json().get("models", [])}
    except (requests.RequestException, ValueError):
        logger.exception("Hazırlık: Ollama'ya erişilemedi")
        return False
    missing = {_normalize_model(m) for m in _required_models()} - available
    if missing:
        logger.error("Hazırlık: Ollama'da eksik model(ler): %s", ", ".join(sorted(missing)))
        return False
    return True


def _check_backup(now: datetime | None = None) -> bool | None:
    settings = get_settings()
    if settings.health_max_backup_age_hours <= 0:
        return None
    latest = backup_service.latest_backup_time(settings.database_url)
    if latest is None:
        logger.error("Hazırlık: hiç yedek yok")
        return False
    age = (now or datetime.now(timezone.utc)) - latest
    if age > timedelta(hours=settings.health_max_backup_age_hours):
        logger.error("Hazırlık: en yeni yedek %s saat önce alınmış", int(age.total_seconds() // 3600))
        return False
    return True


def readiness(db: Session) -> dict[str, bool]:
    checks = {"database": _check_database(db), "llm": _check_llm()}
    backup = _check_backup()
    if backup is not None:
        checks["backup"] = backup
    return checks
