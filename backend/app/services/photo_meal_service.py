import base64
import json
import re
from dataclasses import dataclass, field

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.agents.llm import get_llm
from app.config import get_settings
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service

MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

PHOTO_ANALYSIS_PROMPT = (
    "Bu fotoğraftaki yemeği/yemekleri incele. Gördüğün her farklı besin için "
    "Türkçe bir isim ver — food_name'e pişirme durumunu MUTLAKA dahil et (çiğ, "
    "pişmiş, haşlanmış, ızgara, kızarmış vb.; görselde ızgara/kızarmış bir "
    "yüzey/renk varsa 'çiğ' YAZMA), sadece besin adını (ör. 'tavuk göğsü' "
    "değil 'ızgara tavuk göğsü') yazma — aynı besinin çiğ/pişmiş hali kalori "
    "açısından çok farklı olduğu için bu bilgi kritik. Ayrıca tahmini porsiyon "
    "miktarını gram cinsinden tahmin et. SADECE şu formatta geçerli bir JSON "
    'listesi döndür, başka hiçbir açıklama/metin ekleme: '
    '[{"food_name": "...", "estimated_grams": 123}]. Emin olamasan bile en '
    "makul tahminini ver; fotoğrafta hiç yemek/besin tanıyamıyorsan boş liste "
    "([]) dön."
)


@dataclass
class PhotoMealItem:
    food_name: str
    estimated_grams: float
    matched_food: FoodCatalog | None = None
    candidates: list[FoodCatalog] = field(default_factory=list)


class PhotoAnalysisError(ValueError):
    pass


def _parse_json_items(raw_content) -> list[dict]:
    text = raw_content if isinstance(raw_content, str) else str(raw_content)
    # Modeller bazen JSON'u ```json ... ``` bloğuna sarabiliyor ya da
    # öncesine/sonrasına açıklama ekleyebiliyor; ilk '[' ile son ']' arasını
    # çıkarıp parse etmek, katı bir "sadece JSON" beklentisinden daha
    # toleranslı (bkz. orchestrator.py'deki benzer temizleme yaklaşımı).
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def analyze_meal_photo(db: Session, image_bytes: bytes, mime_type: str) -> list[PhotoMealItem]:
    """Fotoğrafı gemma4:e4b'nin native vision desteğiyle analiz edip
    tanınan her besin için (isim, tahmini gram) çifti üretir, ardından her
    birini besin kataloğuyla eşleştirmeye çalışır (log_meal ile AYNI
    fuzzy-match akışı). Kalori/makro değerleri BURADA hesaplanmaz — bu
    fonksiyon sadece bir ÖN İZLEME üretir, gerçek kayıt kullanıcı onayından
    sonra mevcut log_meal (katalog tabanlı, tahmini değer yazmayan) akışıyla
    yapılır."""
    if len(image_bytes) > MAX_PHOTO_BYTES:
        raise PhotoAnalysisError("Fotoğraf çok büyük (en fazla 8 MB olmalı).")
    if mime_type not in ALLOWED_MIME_TYPES:
        raise PhotoAnalysisError("Desteklenmeyen dosya türü (sadece JPEG/PNG/WEBP).")

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    message = HumanMessage(
        content=[
            {"type": "text", "text": PHOTO_ANALYSIS_PROMPT},
            {"type": "image_url", "image_url": f"data:{mime_type};base64,{b64}"},
        ]
    )
    response = get_llm(model_name=get_settings().photo_vision_model_name, reasoning=False).invoke([message])
    raw_items = _parse_json_items(response.content)

    results: list[PhotoMealItem] = []
    for raw in raw_items:
        food_name = str(raw.get("food_name") or "").strip()
        try:
            estimated_grams = float(raw.get("estimated_grams") or 0)
        except (TypeError, ValueError):
            estimated_grams = 0
        if not food_name or estimated_grams <= 0:
            continue

        match, score = food_catalog_service.best_match(db, food_name)
        if match is not None and score >= food_catalog_service.FUZZY_MATCH_THRESHOLD:
            results.append(PhotoMealItem(food_name=food_name, estimated_grams=estimated_grams, matched_food=match))
        else:
            candidates = food_catalog_service.search_foods(db, food_name, limit=3)
            results.append(
                PhotoMealItem(food_name=food_name, estimated_grams=estimated_grams, candidates=candidates)
            )

    return results
