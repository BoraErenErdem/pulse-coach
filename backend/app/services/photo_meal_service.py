import base64
import json
import logging
import re
from dataclasses import dataclass, field

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.agents.llm import get_llm
from app.config import get_settings
from app.exceptions import AppValidationError
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service
from app.services.fuzzy_match import tr_lower

logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
# Gerçek dosya imzaları (magic bytes) - mime_type parametresi istemcinin
# beyan ettiği Content-Type'tan geliyor (bkz. nutrition_photos.py), sunucu
# tarafında hiç doğrulanmıyordu (2026-08-26 güvenlik denetimi). Bir istemci
# "image/png" deyip farklı bir binary gönderebilirdi; bu artık ilk birkaç
# bayt gerçek dosya imzasıyla karşılaştırılarak engelleniyor.
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # WEBP: "RIFF" + 4 baytlık boyut + "WEBP", ayrıca kontrol edilir
}


def _sniff_image_type_matches(image_bytes: bytes, mime_type: str) -> bool:
    signatures = _MAGIC_BYTES.get(mime_type)
    if not signatures:
        return False
    if mime_type == "image/webp":
        return image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP"
    return any(image_bytes.startswith(sig) for sig in signatures)

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
    "vermekten ALIKOYMAZ. food_name_en'e AYNI besinin İngilizce adını yaz "
    "(pişirme durumu dahil, ör. 'grilled chicken breast'). SADECE şu formatta "
    "geçerli bir JSON listesi döndür, başka hiçbir açıklama/metin ekleme: "
    '[{"food_name": "...", "food_name_en": "...", '
    '"estimated_grams": 123, "is_uncertain": false}]. Emin olamasan bile en '
    "makul tahminini ver; fotoğrafta hiç yemek/besin tanıyamıyorsan boş liste "
    "([]) dön."
)


# Vision modeli adları süslüyor (2026-09-30 prod provası): "taze roka yaprakları"
# -> "Krizantem yaprakları", "haşlanmış veya sotelenmiş karabuğday (greçka)" -> ekmek,
# ve adaylar da aynı yanlış kayıtlardı. Pişirme durumu kaloriyi değiştirdiği için
# tam ad önce denenir; sadeleştirilmiş varyantlar yalnız DAHA İYİ skor verirse
# kazanır. Yalnız fotoğraf akışında - sohbetteki öğün kaydı adları zaten sade.
_PHOTO_FILLER_WORDS = frozenset(
    {"taze", "doğranmış", "dilimlenmiş", "rendelenmiş", "yaprakları", "yaprağı", "mikro", "parçaları", "dilimi"}
)


def _photo_query_variants(food_name: str) -> list[str]:
    without_parens = re.sub(r"\s*\([^)]*\)", "", food_name).strip()
    # "haşlanmış veya sotelenmiş karabuğday" -> "haşlanmış karabuğday"
    without_alternatives = re.sub(r"\s+veya\s+\S+", "", without_parens).strip()
    without_filler = " ".join(w for w in without_alternatives.split() if tr_lower(w) not in _PHOTO_FILLER_WORDS)
    parenthesized = [m.strip() for m in re.findall(r"\(([^)]*)\)", food_name)]
    variants: list[str] = []
    for variant in (food_name, without_parens, without_alternatives, without_filler, *parenthesized):
        if variant and variant not in variants:
            variants.append(variant)
    return variants


def _match_photo_food(db: Session, food_name: str) -> tuple[FoodCatalog | None, list[FoodCatalog]]:
    """(otomatik eşleşme, eşleşme yoksa kullanıcıya gösterilecek adaylar)."""
    variants = _photo_query_variants(food_name)
    best, best_score = None, 0.0
    for variant in variants:
        match, score = food_catalog_service.best_match(db, variant)
        if match is not None and score > best_score:
            best, best_score = match, score
    if best is not None and best_score >= food_catalog_service.FUZZY_MATCH_THRESHOLD:
        return best, []
    # En sade varyantın adayları önce: süslü tam adın adayları genelde alakasız.
    candidates: list[FoodCatalog] = []
    for variant in reversed(variants):
        for candidate in food_catalog_service.search_foods(db, variant, limit=3):
            if candidate not in candidates:
                candidates.append(candidate)
    return None, candidates[:3]


@dataclass
class PhotoMealItem:
    # Katalog eşleştirmesi Türkçe adla yapılır (katalog + dolgu kelimesi temizliği Türkçe).
    food_name: str
    estimated_grams: float
    matched_food: FoodCatalog | None = None
    candidates: list[FoodCatalog] = field(default_factory=list)
    # Model porsiyon/pişirme yöntemi konusunda kendinden emin değilse true -
    # foto-tabanlı kalori tahmininin sistematik olarak saptığı (özellikle
    # görünmeyen yağ/sos nedeniyle) bilinen bir sınırlama; kullanıcıya bu
    # belirsizliği şeffaf göstermek için kullanılıyor (bkz. rekabet analizi).
    is_uncertain: bool = False
    # İngilizce arayüzde gösterilecek ad (2026-10-07): önceden İngilizce kullanıcı "Detected:
    # 'ızgara tavuk göğsü'" görüyordu. Model vermezse Türkçe ada düşülür.
    food_name_en: str | None = None

    def display_name(self, language: str) -> str:
        return self.food_name_en if language == "en" and self.food_name_en else self.food_name


class PhotoAnalysisError(AppValidationError):
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
        raise PhotoAnalysisError("photo_too_large")
    if mime_type not in ALLOWED_MIME_TYPES:
        raise PhotoAnalysisError("unsupported_photo_type")
    if not _sniff_image_type_matches(image_bytes, mime_type):
        logger.warning(
            "photo_meal_service: beyan edilen mime_type (%s) dosya imzasıyla uyuşmuyor", mime_type
        )
        raise PhotoAnalysisError("unsupported_photo_type")

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
        food_name_en = str(raw.get("food_name_en") or "").strip() or None

        match, candidates = _match_photo_food(db, food_name)
        if match is not None:
            results.append(
                PhotoMealItem(
                    food_name=food_name,
                    estimated_grams=estimated_grams,
                    matched_food=match,
                    is_uncertain=is_uncertain,
                    food_name_en=food_name_en,
                )
            )
        else:
            results.append(
                PhotoMealItem(
                    food_name=food_name,
                    estimated_grams=estimated_grams,
                    candidates=candidates,
                    is_uncertain=is_uncertain,
                    food_name_en=food_name_en,
                )
            )

    return results
