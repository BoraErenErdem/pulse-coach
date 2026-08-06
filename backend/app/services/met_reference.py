"""Kardiyo/esneklik setleri için kalori tahmini - MET (Metabolic Equivalent
of Task) yöntemi. Formül: kalori = MET x kilo(kg) x süre(saat).

Kaynak: Compendium of Physical Activities (Ainsworth ve ark., 1993, güncel
2024 sürümü) - epidemiyolojik/spor bilimi çalışmalarında referans alınan
akademik standart, ACE/CDC gibi kurumlarca da kullanılıyor. Değerler
2026-08-06'da iki bağımsız (Compendium'a dayanan) kaynaktan çapraz kontrol
edilip (~%15 toleransla, besin kataloğu curation'ındaki AYNI titizlik)
tutarlı aralıklar seçildi.

Kullanıcının önerdiği "koşu bandında N hız N eğim N dakika" seviyesinde bir
tablo BİLEREK kurulmadı - onlarca kombinasyonun her biri ayrı ayrı
doğrulanması gerekirdi (kaynak güvenilirliği/iş yükü orantısız). Bunun
yerine geniş kategori x 3 yoğunluk seviyesi (hafif/orta/yoğun) kullanılıyor
- kullanıcı plan onayı sırasında bu yaklaşımı tercih etti."""

CardioCategory = str
Intensity = str

CARDIO_CATEGORY_LABELS: dict[CardioCategory, str] = {
    "kosu": "Koşu",
    "bisiklet": "Bisiklet",
    "yuruyus": "Yürüyüş",
    "yuzme": "Yüzme",
    "ip_atlama": "İp Atlama",
    "genel_kardiyo": "Genel Kardiyo",
}

FLEXIBILITY_CATEGORY = "esneklik"
FLEXIBILITY_CATEGORY_LABELS: dict[CardioCategory, str] = {
    FLEXIBILITY_CATEGORY: "Esneklik",
}

INTENSITY_LABELS: dict[Intensity, str] = {
    "hafif": "Hafif",
    "orta": "Orta",
    "yogun": "Yoğun",
}

# category -> intensity -> MET değeri.
MET_TABLE: dict[CardioCategory, dict[Intensity, float]] = {
    "kosu": {"hafif": 6.0, "orta": 8.3, "yogun": 9.8},
    "bisiklet": {"hafif": 4.0, "orta": 6.8, "yogun": 10.0},
    "yuruyus": {"hafif": 2.8, "orta": 3.5, "yogun": 4.8},
    "yuzme": {"hafif": 4.8, "orta": 5.8, "yogun": 9.8},
    "ip_atlama": {"hafif": 8.8, "orta": 10.0, "yogun": 11.8},
    "genel_kardiyo": {"hafif": 3.5, "orta": 5.0, "yogun": 8.5},
    FLEXIBILITY_CATEGORY: {"hafif": 2.3, "orta": 3.0, "yogun": 4.0},
}

VALID_CARDIO_CATEGORIES = set(MET_TABLE.keys())
VALID_INTENSITIES = set(INTENSITY_LABELS.keys())


def estimate_calories(
    cardio_category: str, intensity: str, duration_minutes: float, weight_kg: float | None
) -> float | None:
    """weight_kg bilinmiyorsa (kullanıcı hiç kilo kaydetmemişse) SPEKÜLATİF
    bir varsayılan kilo KULLANMADAN None döner - projenin "veri yoksa
    dürüst ol" ilkesiyle tutarlı (bkz. EMPTY_REPLY_FALLBACK, korelasyon
    "yeterli veri yok" mesajı)."""
    if weight_kg is None:
        return None
    met = MET_TABLE.get(cardio_category, {}).get(intensity)
    if met is None:
        return None
    calories = met * weight_kg * (duration_minutes / 60)
    return round(calories, 1)
