"""PulseCoach FastAPI backend'i için ince bir HTTP istemcisi.

Streamlit arayüzü agent mantığını/DB'yi kendi içine gömmez, sadece bu istemci
üzerinden backend'e istek atar (spec: "Streamlit şimdilik sadece bir istemci").
"""

import os
import requests

API_BASE_URL = os.environ.get("PULSECOACH_API_BASE_URL", "http://localhost:8000")


class ApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _request(method: str, path: str, token: str | None = None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(method, f"{API_BASE_URL}{path}", headers=headers, timeout=60, **kwargs)
    except requests.ConnectionError as exc:
        raise ApiError(f"Backend'e ulaşılamıyor ({API_BASE_URL}). Sunucu çalışıyor mu?") from exc

    if not response.ok:
        detail = response.text
        try:
            detail = response.json().get("detail", detail)
        except ValueError:
            pass
        raise ApiError(str(detail), status_code=response.status_code)
    return response.json()


def register(email: str, password: str) -> dict:
    return _request("POST", "/auth/register", json={"email": email, "password": password})


def login(email: str, password: str) -> str:
    body = _request("POST", "/auth/login", json={"email": email, "password": password})
    return body["access_token"]


def get_me(token: str) -> dict:
    return _request("GET", "/users/me", token=token)


def send_chat_message(token: str, message: str) -> dict:
    return _request("POST", "/chat", token=token, json={"message": message})


def get_chat_history(token: str) -> list[dict]:
    return _request("GET", "/chat/history", token=token)


def log_progress(
    token: str,
    weight: float | None = None,
    workout_completed: bool = False,
    workout_type: str | None = None,
) -> dict:
    return _request(
        "POST",
        "/progress/log",
        token=token,
        json={"weight": weight, "workout_completed": workout_completed, "workout_type": workout_type},
    )


def get_weekly_summary(token: str) -> dict:
    return _request("GET", "/progress/weekly-summary", token=token)


def get_progress_logs(token: str, days: int | None = None) -> list[dict]:
    params = {"days": days} if days is not None else {}
    return _request("GET", "/progress/logs", token=token, params=params)
