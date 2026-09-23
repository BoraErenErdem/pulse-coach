"""Sohbet kayıt regresyon değerlendirmesi (2026-09-23).

Neden var: 2026-09-23 denetiminde en kritik hata ("3 set 10 tekrar" -> 1 set
kaydedilip "3 seti kaydettim" denmesi) birim testlerle YAKALANAMADI - model
sadece bazı çalıştırmalarda (~1/4) tanımsız bir parametreyle yanlış aracı
çağırıyordu. Bu script, yaygın kullanıcı cümlelerini GERÇEK modelle (Ollama)
birden çok kez çalıştırıp modelin hangi aracı hangi argümanlarla çağırdığını ve
DB'ye GERÇEKTE ne yazıldığını beklenen sonuçla karşılaştırır.

Kullanım (backend/ içinden, `ollama serve` açıkken):
    python -m eval.chat_regression                # tüm senaryolar, 3 deneme
    python -m eval.chat_regression --trials 5 --only squat_3x10,bench_4x8

Güvenlik: geliştirme DB'sinin (katalog verisi için) GEÇİCİ bir KOPYASINDA
çalışır - her deneme yeni bir kullanıcıyla, gerçek DB'ye hiçbir şey yazılmaz.
Sonuç: eval/results/chat_regression_<zaman>.json + terminal özeti. Bir
senaryonun başarı oranı %100'ün altındaysa çıkış kodu 1 (CI/elle takip için).
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


@dataclass
class Outcome:
    sets: list[tuple[str, int | None, float | None, float | None]]  # (isim, tekrar, kg, dakika)
    meals: list[tuple[str, float]]  # (isim, gram)
    reply: str
    tool_calls: list[tuple[str, dict]]


@dataclass
class Scenario:
    key: str
    message: str
    # (başarılı mı, kısa açıklama)
    check: Callable[[Outcome], tuple[bool, str]]


def _sets_equal(expected: list[tuple[int | None, float | None]]) -> Callable[[Outcome], tuple[bool, str]]:
    """Kayıtlı setlerin (tekrar, kg) listesi sırası önemsiz şekilde beklenene eşit mi."""

    def check(o: Outcome) -> tuple[bool, str]:
        got = sorted(((reps, kg) for _, reps, kg, _ in o.sets), key=str)
        want = sorted(expected, key=str)
        return got == want, f"beklenen {want}, kaydedilen {got}"

    return check


def _one_duration_set(minutes: float) -> Callable[[Outcome], tuple[bool, str]]:
    def check(o: Outcome) -> tuple[bool, str]:
        durations = [m for *_, m in o.sets if m is not None]
        return durations == [minutes], f"beklenen [{minutes}] dk, kaydedilen {durations}"

    return check


def _meals_contain(*needles: str, forbidden: tuple[str, ...] = ()) -> Callable[[Outcome], tuple[bool, str]]:
    """`needles` Türkçe KÖK olmalı (ör. "ekme" - "ekmek" -> "ekmeği" k/ğ
    yumuşaması yüzünden tam kelime eşleşmez). `forbidden`: yanlış katalog
    eşleşmesi işaretleri (ör. "2 yumurta" -> "Yumurta, beyazı")."""

    def check(o: Outcome) -> tuple[bool, str]:
        names = [name.lower() for name, _ in o.meals]
        missing = [n for n in needles if not any(n in name for name in names)]
        wrong = [f for f in forbidden if any(f in name for name in names)]
        ok = not missing and not wrong and len(o.meals) == len(needles)
        return ok, f"öğünler {o.meals}, eksik {missing}, yanlış eşleşme {wrong}"

    return check


SCENARIOS = [
    Scenario("squat_3x10", "Bugün squat yaptım: 3 set, 10 tekrar, 62.5 kg", _sets_equal([(10, 62.5)] * 3)),
    Scenario("bench_4x8", "bench press 4x8 70 kilo", _sets_equal([(8, 70.0)] * 4)),
    Scenario(
        "latpulldown_sirasiyla",
        "lat pulldown 3 set 10 tekrar sırasıyla 50, 55, 60 kg",
        _sets_equal([(10, 50.0), (10, 55.0), (10, 60.0)]),
    ),
    Scenario("mekik_bodyweight", "3 set 20 mekik çektim", _sets_equal([(20, None)] * 3)),
    Scenario("single_set", "60 kilo 8 tekrar deadlift yaptım", _sets_equal([(8, 60.0)])),
    Scenario("cardio_duration", "bugün 25 dakika orta tempoda koştum", _one_duration_set(25.0)),
    Scenario("meal_two_items", "kahvaltıda 2 yumurta ve 1 dilim tam buğday ekmeği yedim", _meals_contain("yumurta", "ekme", forbidden=("beyaz", "sarı"))),
]


def _prepare_db_copy() -> Path:
    """Geliştirme DB'sinin tutarlı bir kopyası (SQLite online backup API)."""
    source = BACKEND_DIR / "health_coach.db"
    target = Path(tempfile.mkdtemp(prefix="pulsecoach_eval_")) / "eval.db"
    src, dst = sqlite3.connect(source), sqlite3.connect(target)
    src.backup(dst)
    src.close()
    dst.close()
    return target


def run(trials: int, only: set[str] | None) -> int:
    db_path = _prepare_db_copy()
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["SCHEDULER_ENABLED"] = "false"

    # DATABASE_URL ayarlandıktan SONRA import - session modül seviyesinde kuruluyor.
    import app.agents.orchestrator as orchestrator
    from app.db.session import SessionLocal
    from app.models.meal_entry import MealEntry
    from app.models.user import User
    from app.models.user_profile import UserProfile
    from app.models.workout_session import WorkoutSession

    scenarios = [s for s in SCENARIOS if only is None or s.key in only]
    results: list[dict] = []
    db = SessionLocal()
    try:
        for scenario in scenarios:
            for trial in range(trials):
                user = User(email=f"eval_{scenario.key}_{trial}_{time.time_ns()}@eval.local", hashed_password="x")
                db.add(user)
                db.commit()
                db.add(UserProfile(user_id=user.id, goal="general_health"))
                db.commit()

                calls: list[tuple[str, dict]] = []
                original_create_agent = orchestrator.create_agent

                def spying_create_agent(*args, **kwargs):
                    agent = original_create_agent(*args, **kwargs)
                    original_invoke = agent.invoke

                    def invoke(inputs, config=None):
                        result = original_invoke(inputs, config=config)
                        for message in result["messages"]:
                            for call in getattr(message, "tool_calls", None) or []:
                                calls.append((call["name"], call["args"]))
                        return result

                    agent.invoke = invoke
                    return agent

                orchestrator.create_agent = spying_create_agent
                started = time.perf_counter()
                try:
                    reply, _agent = orchestrator.run_orchestrator(db, user.id, scenario.message)
                finally:
                    orchestrator.create_agent = original_create_agent
                elapsed = time.perf_counter() - started

                outcome = Outcome(
                    sets=[
                        (s.exercise_name_snapshot, s.reps, s.weight_kg, s.duration_minutes)
                        for ws in db.query(WorkoutSession).filter_by(user_id=user.id)
                        for s in ws.sets
                    ],
                    meals=[(m.food_name_snapshot, m.quantity_grams) for m in db.query(MealEntry).filter_by(user_id=user.id)],
                    reply=reply,
                    tool_calls=calls,
                )
                ok, detail = scenario.check(outcome)
                results.append(
                    {
                        "scenario": scenario.key,
                        "trial": trial,
                        "ok": ok,
                        "detail": detail,
                        "seconds": round(elapsed, 1),
                        "tool_calls": calls,
                        "reply": reply,
                    }
                )
                print(f"[{'OK ' if ok else 'FAIL'}] {scenario.key} #{trial} ({elapsed:.1f}s) {'' if ok else detail}")
    finally:
        db.close()
        shutil.rmtree(db_path.parent, ignore_errors=True)

    out_dir = BACKEND_DIR / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"chat_regression_{datetime.now():%Y%m%d_%H%M%S}.json"
    out_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nÖzet (senaryo: başarı/deneme):")
    all_passed = True
    for scenario in scenarios:
        rows = [r for r in results if r["scenario"] == scenario.key]
        passed = sum(r["ok"] for r in rows)
        all_passed &= passed == len(rows)
        print(f"  {scenario.key:24s} {passed}/{len(rows)}")
    print(f"\nHam sonuçlar: {out_file}")
    return 0 if all_passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--trials", type=int, default=3, help="senaryo başına deneme sayısı (varsayılan 3)")
    parser.add_argument("--only", type=str, default=None, help="virgülle ayrılmış senaryo anahtarları")
    args = parser.parse_args()
    only = set(args.only.split(",")) if args.only else None
    sys.exit(run(args.trials, only))


if __name__ == "__main__":
    main()
