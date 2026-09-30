"""GET /health/ready (bkz. app/services/health_service.py)."""

import os
import time

from app.config import get_settings
from app.services import health_service


class _Tags:
    def __init__(self, names):
        self._names = names

    def raise_for_status(self):
        return None

    def json(self):
        return {"models": [{"name": n} for n in self._names]}


def _ollama_with(monkeypatch, names):
    monkeypatch.setattr(health_service.requests, "get", lambda url, timeout: _Tags(names))


def test_ready_ok_when_database_and_models_available(client, monkeypatch):
    _ollama_with(monkeypatch, ["gemma4:e4b", "gemma4:12b", "nomic-embed-text:latest"])
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": True, "llm": True}}


def test_ready_degraded_when_model_missing(client, monkeypatch):
    _ollama_with(monkeypatch, ["gemma4:e4b", "nomic-embed-text:latest"])
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["llm"] is False


def test_ready_degraded_when_ollama_unreachable(client, monkeypatch):
    def boom(url, timeout):
        raise health_service.requests.ConnectionError("refused")

    monkeypatch.setattr(health_service.requests, "get", boom)
    response = client.get("/health/ready")
    assert response.status_code == 503
    # İç hata ayrıntısı dışarı verilmez.
    assert "refused" not in response.text


def test_ready_checks_backup_age_when_enabled(client, monkeypatch, tmp_path):
    _ollama_with(monkeypatch, ["gemma4:e4b", "gemma4:12b", "nomic-embed-text"])
    monkeypatch.setattr(get_settings(), "health_max_backup_age_hours", 36)
    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path))

    assert client.get("/health/ready").json()["checks"]["backup"] is False

    backup = tmp_path / "pulsecoach_20260930_030000_000000.dump"
    backup.write_bytes(b"PGDMP")
    assert client.get("/health/ready").status_code == 200

    two_days_ago = time.time() - 48 * 3600
    os.utime(backup, (two_days_ago, two_days_ago))
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["backup"] is False
