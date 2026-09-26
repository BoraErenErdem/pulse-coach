"""Sohbet gecikme/kapasite ölçümü (2026-09-26) - gerçek model gerekir (ollama serve).

Canlıya geçişte GPU boyutu ve eşzamanlı kullanıcı kapasitesini tahmin etmek için:
- Ollama'nın saf üretim hızı (token/sn) ve ilk token süresi,
- uygulamanın gerçek akışı (ChatStream: araçlar, bilgi tabanı, korumalar dahil)
  eşzamanlılık 1/2/4'te: durum, ilk metin ve toplam süre.

Geçici bir SQLite dosyasında kendi test kullanıcısıyla çalışır, geliştirme
veritabanına dokunmaz. Kullanım (backend/): python -m eval.latency_benchmark [--levels 1 2 4]
"""

import argparse
import json
import statistics
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agents.orchestrator import ChatStream
from app.config import get_settings
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile

MESSAGES = [
    "Kahvaltıda ne yemeliyim? Kısaca.",
    "Bugün 3 set 10 tekrar 60 kilo bench press yaptım, kaydeder misin?",
    "Squat yaparken dizlerim ağrıyor, neye dikkat etmeliyim?",
    "Öğlen 150 gram tavuk göğsü ve 200 gram pilav yedim.",
]
RESULTS_DIR = Path(__file__).parent / "results"


def raw_model_speed() -> dict:
    s = get_settings()
    body = {
        "model": s.llm_model_name,
        "prompt": "Sağlıklı beslenme hakkında iki paragraf yaz.",
        "stream": False,
        "think": False,
        # Uygulamayla AYNI bağlam boyutu: farklı num_ctx Ollama'da modeli yeniden
        # yükletir (~15 sn) - canlıda da farklı ayarlı istekler (foto/gömme modeli)
        # sohbet modelini bellekten atabilir.
        "options": {"num_predict": 256, "num_ctx": s.llm_num_ctx},
    }
    r = requests.post(f"{s.ollama_base_url}/api/generate", json=body, timeout=600).json()
    return {
        "model": s.llm_model_name,
        "eval_tokens": r.get("eval_count"),
        "tokens_per_sec": round(r["eval_count"] / (r["eval_duration"] / 1e9), 1) if r.get("eval_duration") else None,
        "prompt_tokens_per_sec": round(r["prompt_eval_count"] / (r["prompt_eval_duration"] / 1e9), 1)
        if r.get("prompt_eval_duration")
        else None,
        "load_sec": round(r.get("load_duration", 0) / 1e9, 2),
    }


def gpu_info() -> str:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() or "bilinmiyor"
    except (OSError, subprocess.SubprocessError):
        return "bilinmiyor"


def one_turn(session_factory, user_id: int, message: str) -> dict:
    db = session_factory()
    t0 = time.perf_counter()
    first_status = first_token = None
    tokens = 0
    try:
        for event in ChatStream(db, user_id, message).events():
            now = time.perf_counter() - t0
            if event["type"] == "tool" and first_status is None:
                first_status = now
            elif event["type"] == "token":
                tokens += 1
                if first_token is None:
                    first_token = now
            elif event["type"] == "done":
                return {
                    "message": message,
                    "status_sec": round(first_status, 2) if first_status else None,
                    "first_text_sec": round(first_token, 2) if first_token else None,
                    "total_sec": round(now, 2),
                    "chunks": tokens,
                    "agent": event["agent_used"],
                    "ok": event["agent_used"] != "orchestrator" or tokens > 0,
                }
    finally:
        db.close()
    return {"message": message, "ok": False}


def run_level(session_factory, user_ids: list[int], level: int) -> dict:
    results: list[dict] = []
    lock = threading.Lock()

    def worker(i: int) -> None:
        r = one_turn(session_factory, user_ids[i], MESSAGES[i % len(MESSAGES)])
        with lock:
            results.append(r)

    t0 = time.perf_counter()
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(level)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    wall = time.perf_counter() - t0

    def stat(key):
        values = [r[key] for r in results if r.get(key) is not None]
        return {"median": round(statistics.median(values), 1), "max": round(max(values), 1)} if values else None

    return {
        "concurrency": level,
        "wall_sec": round(wall, 1),
        "first_text": stat("first_text_sec"),
        "total": stat("total_sec"),
        "ok": sum(1 for r in results if r.get("ok")),
        "turns": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--levels", type=int, nargs="+", default=[1, 2, 4])
    args = parser.parse_args()

    tmp = Path(tempfile.mkdtemp()) / "bench.db"
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        users = []
        for i in range(max(args.levels)):
            user = User(email=f"bench{i}@example.com", hashed_password="x")
            db.add(user)
            db.flush()
            db.add(UserProfile(user_id=user.id, goal="general_health", activity_level="moderate"))
            users.append(user.id)
        db.commit()

    print("GPU:", gpu_info())
    speed = raw_model_speed()
    print("Isınma (model yükleme)...")
    one_turn(factory, users[0], "Merhaba")
    print("Saf model hızı:", speed)

    levels = []
    for level in args.levels:
        result = run_level(factory, users, level)
        levels.append(result)
        print(
            f"eşzamanlılık {level}: duvar {result['wall_sec']} sn, ilk metin {result['first_text']}, "
            f"toplam {result['total']}, başarılı {result['ok']}/{level}"
        )

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"latency_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps({"gpu": gpu_info(), "raw_model": speed, "levels": levels}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Ham sonuçlar:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
