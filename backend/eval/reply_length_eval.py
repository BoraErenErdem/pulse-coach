"""Yanıt uzunluğu eval'i (2026-09-26) - gerçek model gerekir (ollama serve).

Kullanıcı kısa isterse kısa, normal sorarsa normal, detay/açıklama isterse uzun
yanıt ilkesinin ne kadar tuttuğunu ölçer. Her soru için: sınıflandırma, modelin
ürettiği HAM yanıt (cümle/token), gösterilen yanıt, kırpılıp kırpılmadığı ve
boşa üretilen oran. Geçici SQLite, geliştirme veritabanına dokunmaz.

Kullanım (backend/): python -m eval.reply_length_eval [--trials 2]
"""

import argparse
import json
import statistics
import tempfile
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agents import orchestrator as orch
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile

PROMPTS = {
    "brief": [
        "Kahvaltıda ne yemeliyim? Kısaca.",
        "Squat sonrası esneme önerir misin? Kısaca.",
        "Protein neden önemli, tek cümleyle söyler misin?",
    ],
    "medium": [
        "Kahvaltıda ne yemeliyim?",
        "Haftada kaç gün antrenman yapmalıyım?",
        "Kardiyo mu ağırlık mı daha iyi?",
    ],
    "detailed": [
        "Kas kazanımı için beslenmeyi detaylı açıklar mısın?",
        "Squat formunu adım adım açıklar mısın?",
        "Uyku ve toparlanma ilişkisini kapsamlı anlat.",
    ],
}
RESULTS_DIR = Path(__file__).parent / "results"


def run_one(db, user_id: int, message: str) -> dict:
    run = orch._prepare(db, user_id, message, None)  # noqa: SLF001 - eval iç yapıyı ölçer
    assert not isinstance(run, tuple)
    t0 = time.perf_counter()
    result = run.agent.invoke(run.inputs, config=orch._AGENT_CONFIG)  # type: ignore[attr-defined]  # noqa: SLF001
    elapsed = time.perf_counter() - t0
    final = result["messages"][-1]
    raw = final.content if isinstance(final.content, str) else ""
    shown, _agent = orch._finalize(run, result["messages"])  # noqa: SLF001
    meta = getattr(final, "response_metadata", {}) or {}
    raw_sentences = len(orch._sentence_end_matches(raw))  # noqa: SLF001
    shown_sentences = len(orch._sentence_end_matches(shown))  # noqa: SLF001
    return {
        "message": message,
        "level": orch.reply_length_level(message),
        "seconds": round(elapsed, 1),
        "raw_chars": len(raw),
        "raw_sentences": raw_sentences,
        "shown_chars": len(shown),
        "shown_sentences": shown_sentences,
        "truncated": len(shown) < len(raw.strip()),
        "wasted_pct": round(100 * (1 - len(shown) / len(raw)), 1) if raw else 0.0,
        "eval_tokens": meta.get("eval_count"),
        "done_reason": meta.get("done_reason"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=1)
    parser.add_argument("--levels", nargs="+", choices=list(PROMPTS), default=list(PROMPTS))
    args = parser.parse_args()

    tmp = Path(tempfile.mkdtemp()) / "length.db"
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    user = User(email="length@example.com", hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, goal="general_health", activity_level="moderate"))
    db.commit()

    rows = []
    for expected, prompts in PROMPTS.items():
        if expected not in args.levels:
            continue
        for prompt in prompts:
            for _ in range(args.trials):
                row = run_one(db, user.id, prompt)
                row["expected_level"] = expected
                rows.append(row)
                print(
                    f"[{row['level']:>8}] {row['seconds']:>5}s ham {row['raw_sentences']:>3} cümle/"
                    f"{row['eval_tokens']} tok -> gösterilen {row['shown_sentences']:>3} cümle"
                    f"{'  KIRPILDI %' + str(row['wasted_pct']) if row['truncated'] else ''}  | {prompt}",
                    flush=True,
                )

    print("\nÖzet (sınıf: ort. süre / ort. ham cümle / ort. gösterilen cümle / kırpılan / sınıf doğru):")
    for level in args.levels:
        group = [r for r in rows if r["expected_level"] == level]
        print(
            f"  {level:>8}: {statistics.mean(r['seconds'] for r in group):5.1f}s / "
            f"{statistics.mean(r['raw_sentences'] for r in group):5.1f} / "
            f"{statistics.mean(r['shown_sentences'] for r in group):5.1f} / "
            f"{sum(r['truncated'] for r in group)}/{len(group)} / "
            f"{sum(r['level'] == level for r in group)}/{len(group)}"
        )
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"reply_length_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Ham sonuçlar:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
