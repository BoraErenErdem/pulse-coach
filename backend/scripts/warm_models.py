"""Ollama modellerini belleğe yükler (2026-10-19): sunucu ya da Ollama yeniden
başlayınca ilk kullanıcı modelin yüklenmesini (~20 sn) beklemesin.

Canlıda `pulsecoach-warm-models.service` Ollama her başladığında bunu çalıştırır;
modeller `LLM_KEEP_ALIVE=-1m` (süresiz) ile bellekte kalır. Sohbet ve fotoğraf
modelleri uygulamanın KENDİ ayarlarıyla (num_ctx, keep_alive) çağrılır: num_ctx
farklı olsaydı ilk gerçek istek modeli yeniden yüklerdi.

Model eksikse ya da Ollama yanıt vermiyorsa yalnız uyarı yazar ve 0 ile çıkar -
ısıtma bir iyileştirme, açılışı durdurmamalı.

Kullanım (backend/ dizininden):
    python -m scripts.warm_models
"""

import time

import requests

from app.config import get_settings

OLLAMA_WAIT_S = 120
REQUEST_TIMEOUT_S = 300


def _wait_for_ollama(base_url: str, limit_s: int) -> bool:
    deadline = time.monotonic() + limit_s
    while True:
        try:
            requests.get(f"{base_url}/api/tags", timeout=5).raise_for_status()
            return True
        except requests.RequestException:
            if time.monotonic() >= deadline:
                return False
            time.sleep(2)


def _warm(url: str, payload: dict, label: str) -> bool:
    started = time.monotonic()
    try:
        response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT_S)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"  UYARI: {label} yüklenemedi: {exc}")
        return False
    print(f"  {label} bellekte ({time.monotonic() - started:.1f} sn)")
    return True


def warm_models() -> int:
    """Yüklenen model sayısını döner."""
    settings = get_settings()
    base_url = settings.ollama_base_url.rstrip("/")
    if not _wait_for_ollama(base_url, OLLAMA_WAIT_S):
        print(f"  UYARI: Ollama {OLLAMA_WAIT_S} sn içinde yanıt vermedi, ısıtma atlandı")
        return 0

    loaded = 0
    for model in dict.fromkeys([settings.llm_model_name, settings.photo_vision_model_name]):
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "."}],
            "stream": False,
            "think": False,
            "keep_alive": settings.llm_keep_alive,
            "options": {"num_ctx": settings.llm_num_ctx, "num_predict": 1},
        }
        loaded += _warm(f"{base_url}/api/chat", payload, model)
    embed_payload = {"model": settings.embedding_model_name, "input": ".", "keep_alive": settings.llm_keep_alive}
    loaded += _warm(f"{base_url}/api/embed", embed_payload, settings.embedding_model_name)
    return loaded


if __name__ == "__main__":
    warm_models()
