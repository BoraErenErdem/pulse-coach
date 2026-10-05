"""Kayıtlı besin adının arayüz diline göre gösterimi (2026-10-05).

`MealEntry.food_name_snapshot` kayıt anındaki dilde yazılıyor; dil sonradan
değişince TR kaydedilen öğün TR görünmeye devam ediyordu. Egzersizden
(bkz. exercise_names.py) farkı: besin adı HER ZAMAN `food_catalog_id`'deki
satırdan türetilir (log_meal kimliği zorunlu tutar, adı çağıran vermez) -
ada göre bulanık bir bağ yok, dolayısıyla bağ güvenilir ve katalog adı
doğrudan gösterilir. Yan etkisi istenen bir şey: katalogda sonradan
düzeltilen çeviri ("Besleyici içeçek" -> "içecek") eski kayıtlarda da düzelir.
Katalog satırı yoksa (eski reseed'lerden kalan sarkan kimlik) kayıtlı ad
iki dilde aynen gösterilir.
"""

from app.models.food_catalog import FoodCatalog


def localized_names(name: str, catalog: FoodCatalog | None) -> tuple[str, str]:
    """(tr, en) gösterim adları."""
    if catalog is None:
        return name, name
    return catalog.name_tr, catalog.name_en


def pick(names: tuple[str, str], language: str) -> str:
    return names[1] if language == "en" else names[0]
