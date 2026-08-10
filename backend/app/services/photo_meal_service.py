import base64
import json
import logging
import re
from dataclasses import dataclass, field

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.agents.llm import get_llm
from app.config import get_settings
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service

logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

PHOTO_ANALYSIS_PROMPT = (
    "Bu fotoğraftaki yemeği/yemekleri incele. Gördüğün her farklı besin için "
    "Türkçe bir isim ver — food_name'e pişirme durumunu MUTLAKA dahil et (çiğ, "
    "pişmiş, haşlanmış, ızgara, kızarmış vb.; görselde ızgara/kızarmış bir "
    "yüzey/renk varsa 'çiğ' YAZMA), sadece besin adını (ör. 'tavuk göğsü' "
    "değil 'ızgara tavuk göğsü') yazma — aynı besinin çiğ/pişmiş hali kalori "
    "açısından çok farklı olduğu için bu bilgi kritik. Ayrıca tahmini porsiyon "
    "miktarını gram cinsinden tahmin et. Fotoğraftan porsiyon/pişirme yöntemi "
    "tam olarak belli değilse (ör. sos/yağ miktarı görünmüyor, karışık bir "
    "yemek içindeki oranlar net değil, ışık/açı yüzünden emin değilsin) "
    "is_uncertain'ı true yap — bu, tahminin normalden daha kaba olduğunu "
    "kullanıcıya bildirmek için kullanılacak, seni yine de en makul tahminini "
    "vermekten ALIKOYMAZ. SADECE şu formatta geçerli bir JSON listesi "
    'döndür, başka hiçbir açıklama/metin ekleme: [{"food_name": "...", '
    '"estimated_grams": 123, "is_uncertain": false}]. Emin olamasan bile en '
    "makul tahminini ver; fotoğrafta hiç yemek/besin tanıyamıyorsan boş liste "
    "([]) dön."
)


@dataclass
class PhotoMealItem:
    food_name: str
    estimated_grams: float
    matched_food: FoodCatalog | None = None
    candidates: list[FoodCatalog] = field(default_factory=list)
    # Model porsiyon/pişirme yöntemi konusunda kendinden emin değilse true -
    # foto-tabanlı kalori tahmininin sistematik olarak saptığı (özellikle
    # görünmeyen yağ/sos nedeniyle) bilinen bir sınırlama; kullanıcıya bu
    # belirsizliği şeffaf göstermek için kullanılıyor (bkz. rekabet analizi).
    is_uncertain: bool = False


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
        # Model hiç JSON-benzeri bir çıktı üretmediyse - önceden bu SESSİZCE
        # boş listeye düşüyordu, "fotoğrafta yemek yok" ile ayırt edilemez
        # şekilde (2026-08-10 pürüz taraması, Tema D - orchestrator.py'deki
        # benzer durumlarda HER ZAMAN logger.warning var, burada hiç yoktu).
        logger.warning("photo_meal_service: model çıktısında JSON liste bulunamadı: %r", text[:500])
        return []
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        logger.warning("photo_meal_service: JSON parse hatası (%s): %r", exc, match.group(0)[:500])
        return []
    if not isinstance(parsed, list):
        logger.warning("photo_meal_service: parse edilen JSON liste değil: %r", parsed)
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
        is_uncertain = bool(raw.get("is_uncertain"))

        match, score = food_catalog_service.best_match(db, food_name)
        if match is not None and score >= food_catalog_service.FUZZY_MATCH_THRESHOLD:
            results.append(
                PhotoMealItem(
                    food_name=food_name,
                    estimated_grams=estimated_grams,
                    matched_food=match,
                    is_uncertain=is_uncertain,
                )
            )
        else:
            candidates = food_catalog_service.search_foods(db, food_name, limit=3)
            results.append(
                PhotoMealItem(
                    food_name=food_name,
                    estimated_grams=estimated_grams,
                    candidates=candidates,
                    is_uncertain=is_uncertain,
                )
            )

    return results
