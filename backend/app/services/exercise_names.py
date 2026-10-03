"""Kayıtlı egzersiz adının arayüz diline göre gösterimi (2026-10-03).

Set/hedef kaydedilirken o anki dilde bir ad yazılıyor (`exercise_name_snapshot`,
`ExerciseGoal.exercise_name`); dil sonradan değişince TR kaydedilen hareket
TR görünmeye devam ediyordu. Kayıtlı ad bağlı olduğu katalog satırının TR ya da
EN adıyla AYNIYSA ad katalogdan gelmiş demektir ve iki dildeki karşılığı
güvenle verilebilir. Aynı değilse ad kullanıcının kendi yazımıdır ya da eski
bir yanlış eşleşmedir (ör. "Quad Machine" -> "Dip Machine") - o zaman yazılan
ad iki dilde de aynen gösterilir, yanlış bir isim UYDURULMAZ.
"""

from app.models.exercise_catalog import ExerciseCatalog
from app.services.fuzzy_match import tr_lower


def is_catalog_name(name: str, catalog: ExerciseCatalog | None) -> bool:
    if catalog is None:
        return False
    key = tr_lower(name.strip())
    return key in (tr_lower(catalog.name_tr.strip()), tr_lower(catalog.name_en.strip()))


def localized_names(name: str, catalog: ExerciseCatalog | None) -> tuple[str, str]:
    """(tr, en) gösterim adları."""
    if catalog is not None and is_catalog_name(name, catalog):
        return catalog.name_tr, catalog.name_en
    return name, name


def pick(names: tuple[str, str], language: str) -> str:
    return names[1] if language == "en" else names[0]
