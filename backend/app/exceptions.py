"""Servis katmanının fırlattığı, kullanıcıya gösterilen dil-duyarlı doğrulama
hataları (2026-08-10 mimari borç raporu, bulgu #1) — önceden router'lar hep
`detail=str(exc)` ile Türkçe-sabit `ValueError` mesajlarını olduğu gibi dışa
veriyordu (aynı dosyalardaki 404 mesajları `{tr,en}` sözlüğüyle dönerken).

`AppValidationError` bir HATA KODU + parametre taşır; `str(exc)` (agent
tool'ların `except ValueError as exc: return str(exc)` deseninde kullandığı)
HER ZAMAN Türkçe metne düşer — bu BİLEREK böyle: tool çıktısı Türkçe-konuşan
orchestrator LLM'ine bağlam olarak gidiyor, LLM zaten EN kullanıcı için
çeviriyor (Faz 3 tasarımı). Router'lar ise `resolve_validation_message()`
ile kullanıcının `preferred_language`'ına göre metne çevirir."""

VALIDATION_MESSAGES: dict[str, dict[str, str]] = {
    "invalid_intensity": {
        "tr": "Geçersiz yoğunluk: {intensity}",
        "en": "Invalid intensity: {intensity}",
    },
    "invalid_cardio_category": {
        "tr": "Geçersiz kategori: {cardio_category}",
        "en": "Invalid category: {cardio_category}",
    },
    "duration_must_be_positive": {
        "tr": "Süre sıfırdan büyük olmalı.",
        "en": "Duration must be greater than zero.",
    },
    "set_needs_reps_or_duration": {
        "tr": "Bir set ya tekrar sayısı ya da süre (dakika) içermeli.",
        "en": "A set must include either reps or a duration (minutes).",
    },
    "reps_must_be_positive": {
        "tr": "Tekrar sayısı sıfırdan büyük olmalı.",
        "en": "Reps must be greater than zero.",
    },
    "invalid_workout_type": {
        "tr": "Geçersiz antrenman türü: {workout_type}",
        "en": "Invalid workout type: {workout_type}",
    },
    "at_least_one_set_required": {
        "tr": "En az bir set girilmeli.",
        "en": "At least one set is required.",
    },
    "invalid_meal_type": {
        "tr": "Geçersiz öğün türü: {meal_type}",
        "en": "Invalid meal type: {meal_type}",
    },
    "quantity_must_be_positive": {
        "tr": "Miktar (gram) sıfırdan büyük olmalı.",
        "en": "Quantity (grams) must be greater than zero.",
    },
    "food_not_found_in_catalog": {
        "tr": "Belirtilen besin kataloğunda bulunamadı.",
        "en": "The specified food was not found in the catalog.",
    },
    "entry_not_linked_to_catalog": {
        "tr": "Bu kayıt bir katalog besinine bağlı değil, miktarı yeniden hesaplanamaz.",
        "en": "This entry isn't linked to a catalog food, so its quantity can't be recalculated.",
    },
    "invalid_mood_key": {
        "tr": "Geçersiz ruh hali: {mood_key}",
        "en": "Invalid mood: {mood_key}",
    },
    "target_weight_must_be_positive": {
        "tr": "Hedef ağırlık sıfırdan büyük olmalı.",
        "en": "Target weight must be greater than zero.",
    },
    "target_reps_must_be_positive": {
        "tr": "Hedef tekrar sayısı sıfırdan büyük olmalı.",
        "en": "Target reps must be greater than zero.",
    },
    "target_duration_must_be_positive": {
        "tr": "Hedef süre sıfırdan büyük olmalı.",
        "en": "Target duration must be greater than zero.",
    },
    "goal_needs_weight_or_duration": {
        "tr": "Bir hedef ya bir ağırlık (opsiyonel tekrar ile) ya da bir süre (dakika) içermeli.",
        "en": "A goal must include either a weight (with optional reps) or a duration (minutes).",
    },
    "photo_too_large": {
        "tr": "Fotoğraf çok büyük (en fazla 8 MB olmalı).",
        "en": "Photo is too large (8 MB maximum).",
    },
    "unsupported_photo_type": {
        "tr": "Desteklenmeyen dosya türü (sadece JPEG/PNG/WEBP).",
        "en": "Unsupported file type (JPEG/PNG/WEBP only).",
    },
    "invalid_goal": {
        "tr": "Geçersiz hedef: {goal}",
        "en": "Invalid goal: {goal}",
    },
    "invalid_activity_level": {
        "tr": "Geçersiz aktivite seviyesi: {activity_level}",
        "en": "Invalid activity level: {activity_level}",
    },
    "invalid_language_preference": {
        "tr": "Geçersiz dil tercihi: {preferred_language}",
        "en": "Invalid language preference: {preferred_language}",
    },
    "invalid_coach_tone": {
        "tr": "Geçersiz koç tonu: {coach_tone}",
        "en": "Invalid coach tone: {coach_tone}",
    },
    "weight_out_of_range": {
        "tr": "Kilo 0 ile 500 kg arasında olmalı.",
        "en": "Weight must be between 0 and 500 kg.",
    },
    "waist_out_of_range": {
        "tr": "Bel çevresi 0 ile 300 cm arasında olmalı.",
        "en": "Waist must be between 0 and 300 cm.",
    },
    "body_fat_out_of_range": {
        "tr": "Vücut yağ oranı 0 ile 100 arasında olmalı.",
        "en": "Body fat % must be between 0 and 100.",
    },
}


class AppValidationError(ValueError):
    """`code`, `VALIDATION_MESSAGES`'taki bir anahtar olmalı; `params` mesaj
    şablonundaki `{...}` yer tutucularını doldurur."""

    def __init__(self, code: str, **params: object) -> None:
        self.code = code
        self.params = params
        super().__init__(VALIDATION_MESSAGES[code]["tr"].format(**params))


def resolve_validation_message(error: AppValidationError, language: str) -> str:
    lang = language if language in ("tr", "en") else "tr"
    return VALIDATION_MESSAGES[error.code][lang].format(**error.params)


def validation_error_to_http(error: AppValidationError, language: str):
    """Router'lardaki `except AppValidationError as exc: raise ...` tekrarını
    kısaltan yardımcı - `from fastapi import HTTPException, status` burada,
    tek amacı servis hatasını HTTP 422'ye çevirmek olduğu için kabul
    edilebilir bir bağımlılık."""
    from fastapi import HTTPException, status

    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=resolve_validation_message(error, language),
    )
