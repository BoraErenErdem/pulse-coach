"""Egzersiz adı/talimatı ve besin adı gibi serbest metin alanlarını yerel
Ollama modeliyle toplu (batch) Türkçe'ye çevirir. Kontrollü kelime dağarcığı
alanları (kategori/ekipman/kas/level/force/mechanic) burada DEĞİL,
`vocab_tr.py`'de sabit sözlükle çevrilir — bu script sadece gerçekten serbest
metin gerektiren alanlarla ilgilenir.

Ara sonuçlar data_sources/{exercises,usda}/translated_cache.json'a anahtar
(source_id/fdc_id) bazlı yazılır — script kesilirse kaldığı yerden devam eder.

Kullanım:
    python -m scripts.translate_catalog --only exercises
    python -m scripts.translate_catalog --only foods
    python -m scripts.translate_catalog --limit 20   # hızlı deneme
"""

import argparse
import json
import re
from pathlib import Path

from langchain_ollama import ChatOllama

from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
EXERCISES_RAW_PATH = BACKEND_DIR / "data_sources" / "exercises" / "exercises.json"
EXERCISES_CACHE_PATH = BACKEND_DIR / "data_sources" / "exercises" / "translated_cache.json"
FOODS_RAW_PATH = BACKEND_DIR / "data_sources" / "usda" / "curated_subset.json"
FOODS_CACHE_PATH = BACKEND_DIR / "data_sources" / "usda" / "translated_cache.json"

_ITEM_RE = re.compile(r"@@@(\d+)@@@\s*\n?(.*?)(?=@@@\d+@@@|\Z)", re.DOTALL)

_TRANSLATE_SYSTEM_PROMPT = (
    "Sen bir çeviri motorusun. Sana @@@N@@@ etiketiyle ayrılmış birden fazla "
    "İngilizce metin parçası verilecek. Her birini doğal, akıcı Türkçe'ye "
    "çevir. ÇOK ÖNEMLİ: yanıtını AYNI @@@N@@@ etiket formatıyla, aynı sırayla "
    "ver. Etiketler ve sayılar dışında hiçbir yorum, açıklama veya ek metin "
    "ekleme. Çok satırlı bir metin (ör. numaralı talimat listesi) geldiyse "
    "satır yapısını koru."
)


def _get_translation_llm() -> ChatOllama:
    """Bu script tek seferlik toplu çeviri yaptığı için (gerçek zamanlı
    sohbet değil), interaktif `get_llm()`'in düşük num_predict sınırı yerine
    daha yüksek bir üst sınırla ayrı bir istemci kurulur. `reasoning=True`
    proje genelinde gemma4:e4b için zorunlu (bkz. LLM tuning notları)."""
    settings = get_settings()
    return ChatOllama(
        model=settings.llm_model_name,
        base_url=settings.ollama_base_url,
        temperature=0.2,
        num_predict=4000,
        keep_alive=settings.llm_keep_alive,
        reasoning=True,
    )


def _build_prompt(items: list[str]) -> str:
    blocks = [f"@@@{i}@@@\n{item}" for i, item in enumerate(items)]
    return _TRANSLATE_SYSTEM_PROMPT + "\n\n" + "\n\n".join(blocks)


def _parse_response(content: str, expected_count: int) -> list[str] | None:
    matches = _ITEM_RE.findall(content)
    result: dict[int, str] = {}
    for index_str, text in matches:
        result[int(index_str)] = text.strip()
    if set(result.keys()) != set(range(expected_count)):
        return None
    return [result[i] for i in range(expected_count)]


def translate_batch(llm: ChatOllama, items: list[str], max_retries: int = 2) -> list[str | None]:
    """items listesini çevirir. Başarısız olursa batch'i ikiye bölüp tekrar
    dener; tek elemanlı bir batch de başarısız olursa o eleman için None
    döner (çağıran taraf bunu is_translated=False fallback'i için kullanır)."""
    if not items:
        return []

    response = llm.invoke(_build_prompt(items))
    parsed = _parse_response(response.content, len(items))
    if parsed is not None:
        return parsed

    if len(items) == 1:
        return [None]

    if max_retries <= 0:
        # Son çare: teker teker dene (her biri kendi tek-elemanlı batch'i).
        return [translate_batch(llm, [item], max_retries=0)[0] for item in items]

    mid = len(items) // 2
    left = translate_batch(llm, items[:mid], max_retries=max_retries - 1)
    right = translate_batch(llm, items[mid:], max_retries=max_retries - 1)
    return left + right


def _load_json(path: Path, default):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def translate_exercises(llm: ChatOllama, batch_size_names: int = 50, batch_size_instructions: int = 6, limit: int | None = None) -> None:
    raw = _load_json(EXERCISES_RAW_PATH, [])
    if limit:
        raw = raw[:limit]
    cache: dict = _load_json(EXERCISES_CACHE_PATH, {})

    pending = [ex for ex in raw if ex["id"] not in cache]
    print(f"[exercises] toplam {len(raw)}, cache'de {len(raw) - len(pending)}, çevrilecek {len(pending)}")

    for start in range(0, len(pending), batch_size_names):
        chunk = pending[start : start + batch_size_names]
        names = [ex["name"] for ex in chunk]
        translated_names = translate_batch(llm, names)

        for ex, name_tr in zip(chunk, translated_names):
            cache[ex["id"]] = {
                "name_tr": name_tr or ex["name"],
                "instructions_tr": None,
                "is_translated": name_tr is not None,
            }
        _save_json(EXERCISES_CACHE_PATH, cache)
        print(f"[exercises] isim çevirisi {start + len(chunk)}/{len(pending)}")

    # Talimatlar (uzun metin) — sadece isim çevirisi başarılı olanlar için,
    # ayrı ve daha küçük batch'lerle.
    needs_instructions = [ex for ex in raw if cache.get(ex["id"], {}).get("instructions_tr") is None and ex.get("instructions")]
    print(f"[exercises] talimat çevirisi bekleyen {len(needs_instructions)}")

    for start in range(0, len(needs_instructions), batch_size_instructions):
        chunk = needs_instructions[start : start + batch_size_instructions]
        blocks = ["\n".join(f"{i + 1}. {step}" for i, step in enumerate(ex["instructions"])) for ex in chunk]
        translated_blocks = translate_batch(llm, blocks)

        for ex, block_tr in zip(chunk, translated_blocks):
            entry = cache[ex["id"]]
            entry["instructions_tr"] = block_tr
            if block_tr is None:
                entry["is_translated"] = False
        _save_json(EXERCISES_CACHE_PATH, cache)
        print(f"[exercises] talimat çevirisi {start + len(chunk)}/{len(needs_instructions)}")


def translate_foods(llm: ChatOllama, batch_size: int = 60, limit: int | None = None) -> None:
    raw = _load_json(FOODS_RAW_PATH, [])
    if limit:
        raw = raw[:limit]
    cache: dict = _load_json(FOODS_CACHE_PATH, {})

    pending = [food for food in raw if str(food["fdc_id"]) not in cache]
    print(f"[foods] toplam {len(raw)}, cache'de {len(raw) - len(pending)}, çevrilecek {len(pending)}")

    for start in range(0, len(pending), batch_size):
        chunk = pending[start : start + batch_size]
        names = [food["name_en"] for food in chunk]
        translated_names = translate_batch(llm, names)

        for food, name_tr in zip(chunk, translated_names):
            cache[str(food["fdc_id"])] = {
                "name_tr": name_tr or food["name_en"],
                "is_translated": name_tr is not None,
            }
        _save_json(FOODS_CACHE_PATH, cache)
        print(f"[foods] {start + len(chunk)}/{len(pending)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["exercises", "foods"], default=None)
    parser.add_argument("--limit", type=int, default=None, help="Hızlı deneme için ilk N kaydı işle")
    args = parser.parse_args()

    llm = _get_translation_llm()

    if args.only in (None, "exercises"):
        translate_exercises(llm, limit=args.limit)
    if args.only in (None, "foods"):
        translate_foods(llm, limit=args.limit)


if __name__ == "__main__":
    main()
