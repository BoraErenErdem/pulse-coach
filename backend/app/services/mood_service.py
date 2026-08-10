from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.mood_log import MoodLog

# Frontend'deki MoodPicker.tsx ile aynı anahtar/etiket eşlemesi (MOOD_KEYS
# sırası orada da bu sırayla tanımlı). Etiketler orchestrator'ın system
# prompt'una bağlam olarak eklenirken kullanılır.
MOOD_LABELS: dict[str, str] = {
    "zor": "Zor",
    "dusuk": "Düşük",
    "notr": "Nötr",
    "iyi": "İyi",
    "harika": "Harika",
}
VALID_MOODS = set(MOOD_LABELS)

# Faz 3: orchestrator sistem promptuna bağlam olarak eklenen mood_label,
# kullanıcının preferred_language'ı "en" ise bu etiketle değiştirilir - LLM'e
# Türkçe bir kelime ("Zor") sızdırıp İngilizce yanıt içinde tuhaf durmasını
# önler (bkz. app/agents/orchestrator.py).
MOOD_LABELS_EN: dict[str, str] = {
    "zor": "Hard",
    "dusuk": "Low",
    "notr": "Neutral",
    "iyi": "Good",
    "harika": "Great",
}

# "Tekrarlayan düşüş" tespiti için düşük kabul edilen ruh halleri.
_LOW_MOODS = {"zor", "dusuk"}


def log_mood(db: Session, user_id: int, mood_key: str, log_date: date_type | None = None) -> MoodLog:
    """Bugün (ya da verilen tarih) için ruh hali kaydeder ya da günceller
    (aynı gün için upsert — kullanıcı başına gün başına tek kayıt). POST
    /mood endpoint'i bu fonksiyonu çağırır — tek iş mantığı katmanı."""
    if mood_key not in VALID_MOODS:
        raise AppValidationError("invalid_mood_key", mood_key=mood_key)

    target_date = log_date or datetime.now(timezone.utc).date()
    existing = (
        db.query(MoodLog)
        .filter(MoodLog.user_id == user_id, MoodLog.log_date == target_date)
        .first()
    )
    if existing is not None:
        existing.mood_key = mood_key
        db.commit()
        db.refresh(existing)
        return existing

    entry = MoodLog(user_id=user_id, mood_key=mood_key, log_date=target_date)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_mood(db: Session, user_id: int, log_date: date_type | None = None) -> MoodLog | None:
    """Verilen günün (varsayılan bugün) ruh hali kaydını döndürür, yoksa None."""
    target_date = log_date or datetime.now(timezone.utc).date()
    return (
        db.query(MoodLog)
        .filter(MoodLog.user_id == user_id, MoodLog.log_date == target_date)
        .first()
    )


def delete_mood(db: Session, user_id: int, log_date: date_type | None = None) -> bool:
    """Verilen günün kaydını siler (widget'ta aynı emojiye tekrar tıklayıp
    seçimi kaldırma senaryosu). Kayıt yoksa False döner, hata fırlatmaz."""
    entry = get_mood(db, user_id, log_date)
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True


def list_mood_history(db: Session, user_id: int, days: int | None = None) -> list[MoodLog]:
    """Kullanıcının ruh hali geçmişini tarih sırasıyla döndürür. `days`
    verilirse sadece son o kadar günü, verilmezse tüm geçmişi döndürür."""
    query = db.query(MoodLog).filter(MoodLog.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(MoodLog.log_date >= since)
    return query.order_by(MoodLog.log_date.asc()).all()


def is_persistent_low_mood(
    db: Session, user_id: int, lookback_days: int = 14, min_low_count: int = 3
) -> bool:
    """Son `lookback_days` içindeki öz-bildirimli ruh hali kayıtlarından en az
    `min_low_count` tanesi "zor" ya da "düşük" ise True döner — tek seferlik
    kötü bir gün değil, TEKRARLAYAN bir düşüş örüntüsü sinyali. Rekabet
    analizinden gelen öneri: mood_support_agent bu durumda her zamankinden
    daha erken/nazikçe bir uzmana yönlendirme yapar (bkz. orchestrator.py,
    prompts.py::MOOD_TREND_CONTEXT_TEMPLATE) — kriz tespitiyle (deterministik,
    ayrı bir katman) KARIŞTIRILMAMALI, bu sadece yumuşak bir tonlama sinyali."""
    logs = list_mood_history(db, user_id, days=lookback_days)
    low_count = sum(1 for log in logs if log.mood_key in _LOW_MOODS)
    return low_count >= min_low_count
