"""gemma4:e4b vs qwen3:14b karşılaştırma eval script'i.

Kullanım:
    python -m eval.run_eval

Her senaryoyu her iki modelle, izole (in-memory SQLite, tek kullanımlık
kullanıcı) bir ortamda çalıştırır; ham sonuçları eval/results/raw_results.json
dosyasına yazar. Öznel kriterler (rag_groundedness, turkish_quality) burada
puanlanmaz — ayrı bir adımda Claude tarafından okunup 1-5 puanlanacak.

Çalışma süresi: ~42 senaryo x 2 model = 84 çağrı, model başına ortalama
15-45 saniye -> toplam ~40-90 dakika. Ollama servisinin (`ollama serve`)
açık olması gerekir.
"""

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.messages import HumanMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.exercise_agent import build_exercise_tools
from app.agents.llm import get_llm
from app.agents.mood_support_agent import (
    CRISIS_RESPONSE,
    build_mood_support_tools,
    check_crisis_indicators,
)
from app.agents.motivation_agent import build_motivation_tools
from app.agents.nutrition_agent import build_nutrition_tools
from app.agents.orchestrator import _TOOL_TO_AGENT, _clean_truncated_reply, _resolve_agent_used
from app.agents.profile_agent import build_profile_tools
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.agents.tracking_agent import build_tracking_tools
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile
from langchain.agents import create_agent

from eval.scenarios import MODELS, SCENARIOS, Scenario

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_PATH = RESULTS_DIR / "raw_results.json"

# Yaygın emoji Unicode bloklarını kapsayan kaba bir aralık — kesin/tam değil
# ama "model emoji kullandı mı" sinyali için yeterli.
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF❤️]"
)
_SENTENCE_END_RE = re.compile(r"[.!?…](?=\s|$)")


def make_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def make_user(db: Session, tag: str, profile_setup: dict | None) -> int:
    user = User(email=f"eval-{tag}@eval.local", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    if profile_setup:
        profile = UserProfile(user_id=user.id, **profile_setup)
        db.add(profile)
        db.commit()
    return user.id


def run_scenario(db: Session, user_id: int, message: str, model_name: str) -> dict:
    if check_crisis_indicators(message):
        return {
            "response": CRISIS_RESPONSE,
            "tool_names_used": [],
            "agent_used": "mood_support_agent",
            "latency_s": 0.0,
        }

    tools = [
        *build_profile_tools(db, user_id),
        *build_nutrition_tools(),
        *build_exercise_tools(),
        *build_tracking_tools(db, user_id),
        *build_motivation_tools(db, user_id),
        *build_mood_support_tools(),
    ]
    agent = create_agent(get_llm(model_name), tools, system_prompt=ORCHESTRATOR_SYSTEM_PROMPT)

    t0 = time.perf_counter()
    result = agent.invoke({"messages": [HumanMessage(content=message)]})
    latency_s = time.perf_counter() - t0

    output_messages = result["messages"]
    tool_names_used = sorted(
        {call["name"] for msg in output_messages for call in getattr(msg, "tool_calls", None) or []}
    )
    final_message = output_messages[-1]
    reply = _clean_truncated_reply(final_message)
    agent_used = _resolve_agent_used(set(tool_names_used))

    return {
        "response": reply,
        "tool_names_used": tool_names_used,
        "agent_used": agent_used,
        "latency_s": round(latency_s, 2),
    }


def auto_checks(scenario: Scenario, outcome: dict) -> dict:
    checks: dict = {}
    response_lower = outcome["response"].lower()

    if scenario.category == "tool_calling":
        called = set(outcome["tool_names_used"])
        if scenario.expect_no_tool:
            checks["expect_no_tool"] = True
            checks["passed"] = len(called) == 0
        else:
            checks["expected_tools"] = sorted(scenario.expected_tools)
            checks["passed"] = scenario.expected_tools.issubset(called)

    elif scenario.category == "orchestrator_routing":
        agents_used = outcome["agent_used"].split("+")
        checks["expected_agent"] = scenario.expected_agent
        checks["passed"] = scenario.expected_agent in agents_used

    elif scenario.category == "boundary_safety":
        contains_ok = (
            any(kw.lower() in response_lower for kw in scenario.must_contain_any)
            if scenario.must_contain_any
            else True
        )
        forbidden_hit = [kw for kw in scenario.must_not_contain_any if kw.lower() in response_lower]
        checks["must_contain_any"] = list(scenario.must_contain_any)
        checks["forbidden_hits"] = forbidden_hit
        checks["passed"] = contains_ok and not forbidden_hit

    # rag_groundedness / turkish_quality: otomatik pass/fail yok, sonradan elle puanlanacak
    return checks


def auxiliary_metrics(response: str) -> dict:
    sentence_count = len(_SENTENCE_END_RE.findall(response)) or (1 if response.strip() else 0)
    emoji_count = len(_EMOJI_RE.findall(response))
    return {
        "char_length": len(response),
        "sentence_count": sentence_count,
        "emoji_count": emoji_count,
    }


def main() -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    results = []
    total = len(SCENARIOS) * len(MODELS)
    done = 0

    # Dış döngü model, iç döngü senaryo — aynı model art arda çalıştığı için
    # Ollama'da sürekli VRAM swap olmuyor, latency ölçümleri daha temiz oluyor.
    for model in MODELS:
        for scenario in SCENARIOS:
            done += 1
            print(f"[{done}/{total}] {scenario.id} ({scenario.category}) x {model}", flush=True)

            db = make_session()
            user_id = make_user(db, f"{scenario.id}-{model.replace(':', '_')}", scenario.profile_setup)
            try:
                outcome = run_scenario(db, user_id, scenario.message, model)
            except Exception as exc:  # eval script - bir senaryo patlarsa diğerlerini engellemesin
                print(f"  HATA: {exc}", flush=True)
                outcome = {
                    "response": f"[HATA: {exc}]",
                    "tool_names_used": [],
                    "agent_used": "error",
                    "latency_s": None,
                }
            finally:
                db.close()

            record = {
                "scenario_id": scenario.id,
                "category": scenario.category,
                "message": scenario.message,
                "model": model,
                "deterministic": scenario.deterministic,
                "notes": scenario.notes,
                **outcome,
                "auto_checks": auto_checks(scenario, outcome),
                "auxiliary_metrics": auxiliary_metrics(outcome["response"]),
            }
            results.append(record)

            RESULTS_PATH.write_text(
                json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
            )

    print(f"\nBitti. {len(results)} kayıt {RESULTS_PATH} dosyasına yazıldı.")


if __name__ == "__main__":
    main()
