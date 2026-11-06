"""Günlük adım (2026-11-06, kullanıcı geri bildirimi: "adım ölçer + kcal").

Adımlar mobil uygulamada Apple Sağlık'tan okunup buraya eşitlenir (web yalnız
gösterir). Kalori YALNIZ BİLGİDİR, günlük kalori hedefine/kalan kcal'ye
EKLENMEZ: hedef zaten profildeki aktivite katsayısıyla günlük hareketi içeriyor
(bkz. calorie_recommendation_service.ACTIVITY_FACTORS) - eklemek aynı hareketi
iki kez sayardı (kullanıcı kararı, 2026-11-06).

Kalori tahmini - ACSM yürüme denklemi: düz zeminde yürümenin NET oksijen
maliyeti 0.1 ml/kg/m = 100 ml/kg/km; 1 L O2 ~ 5 kcal -> ~0.5 kcal/kg/km
(dinlenme harcaması hariç, o zaten BMR'de). Mesafe = adım x adım uzunluğu;
adım uzunluğu yaygın kural: boy x 0.415 (erkek) / 0.413 (kadın). Örnek:
175 cm, 70 kg, 10.000 adım -> 7.26 km -> ~254 kcal.

Kilo hiç kaydedilmemişse kalori None döner (met_reference ile aynı "veri yoksa
uydurma" ilkesi); boy bilinmiyorsa ortalama adım uzunluğu kullanılır - mesafe
hatası kilonunkinden çok daha küçük. Kayıtlı yürüyüş/koşu antrenmanlarının
adımları da bu sayının içindedir; iki tahmin ayrı gösterilir, toplanmaz."""

from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.exceptions import AppValidationError
from app.models.daily_steps import DailySteps
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services.limits import MAX_DAILY_STEPS, MAX_STEP_SYNC_DAYS
from app.services.progress_service import get_latest_weight
from app.services.user_time import user_today

NET_WALKING_KCAL_PER_KG_KM = 0.5
STRIDE_FACTOR = {"male": 0.415, "female": 0.413}
_DEFAULT_STRIDE_FACTOR = 0.414
# Boy bilinmiyorsa: ~170 cm yetişkinin adım uzunluğu.
DEFAULT_STRIDE_M = 0.70
VALID_SOURCES = {"apple_health"}
# KVKK metni 2.1'in sürümü: metin maddi değişirse artır (hangi metne rıza verildiği ayrışsın).
STEPS_CONSENT_VERSION = "1.0"


class StepsConsentRequired(AppValidationError):
    """Rıza yokken eşitleme: router 403 döner (422 değil - veri geçerli, izin yok)."""

    def __init__(self) -> None:
        super().__init__("steps_consent_required")


def has_steps_consent(db: Session, user_id: int) -> bool:
    user = db.get(User, user_id)
    return user is not None and user.steps_consent_at is not None


def give_steps_consent(db: Session, user_id: int) -> datetime:
    """Apple Sağlık bağlanırken gösterilen rıza metninin onayı (tarih + metin sürümü)."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    now = datetime.now(timezone.utc)
    user.steps_consent_at = now
    user.steps_consent_version = STEPS_CONSENT_VERSION
    db.commit()
    return now


def stride_length_m(height_cm: float | None, sex: str | None) -> float:
    if height_cm is None:
        return DEFAULT_STRIDE_M
    return height_cm / 100 * STRIDE_FACTOR.get(sex or "", _DEFAULT_STRIDE_FACTOR)


def estimate_step_calories(
    steps: int, weight_kg: float | None, height_cm: float | None = None, sex: str | None = None
) -> float | None:
    """Adımlardan yürüme kalorisi (net, kcal, tam sayıya yuvarlı). Kilo yoksa None."""
    if weight_kg is None:
        return None
    if steps <= 0:
        return 0.0
    distance_km = steps * stride_length_m(height_cm, sex) / 1000
    return float(round(NET_WALKING_KCAL_PER_KG_KM * weight_kg * distance_km))


def sync_steps(
    db: Session, user_id: int, days: list[tuple[date_type, int]], source: str = "apple_health"
) -> int:
    """Telefonun gönderdiği (gün, adım) listesini upsert eder; yazılan gün sayısını
    döndürür. Doğrulama hepsi-ya-hiçbiri: tek bir geçersiz gün tüm isteği reddeder.
    Aynı gün listede iki kez varsa sonuncusu geçerli."""
    if not has_steps_consent(db, user_id):
        raise StepsConsentRequired()
    if source not in VALID_SOURCES:
        source = "apple_health"
    today = user_today(db, user_id)
    oldest = today - timedelta(days=MAX_STEP_SYNC_DAYS - 1)
    merged: dict[date_type, int] = {}
    for day, steps in days:
        if steps < 0 or steps > MAX_DAILY_STEPS:
            raise AppValidationError("step_count_out_of_range", max=MAX_DAILY_STEPS)
        if day > today or day < oldest:
            raise AppValidationError("step_date_out_of_range", days=MAX_STEP_SYNC_DAYS)
        merged[day] = steps
    if not merged:
        return 0

    existing = {
        row.step_date: row
        for row in db.query(DailySteps)
        .filter(DailySteps.user_id == user_id, DailySteps.step_date.in_(list(merged)))
        .all()
    }
    for day, steps in merged.items():
        row = existing.get(day)
        if row is None:
            db.add(DailySteps(user_id=user_id, step_date=day, steps=steps, source=source))
        elif row.steps != steps or row.source != source:
            row.steps = steps
            row.source = source
    db.commit()
    return len(merged)


def delete_all_steps(db: Session, user_id: int) -> int:
    """Apple Sağlık bağlantısı kesilince: rıza geri çekilir, eşitlenmiş tüm adımlar silinir."""
    count = db.query(DailySteps).filter(DailySteps.user_id == user_id).delete(synchronize_session=False)
    user = db.get(User, user_id)
    if user is not None:
        user.steps_consent_at = None
        user.steps_consent_version = None
    db.commit()
    return count


@dataclass
class StepDay:
    day: date_type
    steps: int
    calories: float | None


@dataclass
class StepSummary:
    today: StepDay
    # Eskiden yeniye, yalnız veri olan günler (bugün dahil, varsa).
    days: list[StepDay] = field(default_factory=list)
    average_steps: int | None = None
    last_synced_at: datetime | None = None
    has_data: bool = False
    weight_known: bool = False
    consented: bool = False

    def as_text(self) -> str:
        """Koç aracı çıktısı - Türkçe (orkestratör bağlamı, bkz. exceptions.py)."""
        # VERİ / NOT ayrımı: 2026-11-06 eval'inde model düz yazılmış iç talimatları
        # ("uydurma", "hedefe eklenmez") kullanıcıya neredeyse aynen tekrarlıyordu.
        note = "NOT (yalnız senin için, kullanıcıya aktarma ya da alıntılama): "
        if not self.has_data:
            return (
                "VERİ: Adım verisi yok - Apple Sağlık bağlı değil ya da henüz eşitlenmedi. "
                + note
                + "sayı verme; tek cümleyle iPhone uygulamasında İlerleme ekranından Apple Sağlık'ı bağlayabileceğini söyle."
            )

        def kcal(d: StepDay) -> str:
            return f", ~{d.calories:.0f} kcal" if d.calories is not None else ""

        parts = [f"VERİ: Bugün ({self.today.day}) şu ana kadar {self.today.steps} adım{kcal(self.today)}."]
        past = [d for d in self.days if d.day != self.today.day]
        if past:
            parts.append(
                "Önceki günler: " + "; ".join(f"{d.day}: {d.steps} adım{kcal(d)}" for d in past) + "."
            )
            if self.average_steps is not None:
                parts.append(f"Ortalama: {self.average_steps} adım/gün.")
        if not self.weight_known:
            parts.append("Kilo kaydı olmadığı için kalori tahmini yok.")
        parts.append(
            note
            + "kcal yürümenin yaklaşık harcamasıdır; günlük kalori hedefi bu hareketi zaten içerdiği için onu "
            "'ek yemek hakkı' gibi sunma. Kayıtlı yürüyüş/koşu antrenmanları bu adımların içindedir, toplama."
        )
        return " ".join(parts)


def get_step_summary(db: Session, user_id: int, days: int = 7) -> StepSummary:
    days = max(1, min(days, MAX_STEP_SYNC_DAYS))
    today = user_today(db, user_id)
    since = today - timedelta(days=days - 1)
    rows = (
        db.query(DailySteps)
        .filter(DailySteps.user_id == user_id, DailySteps.step_date >= since, DailySteps.step_date <= today)
        .order_by(DailySteps.step_date.asc())
        .all()
    )
    weight = get_latest_weight(db, user_id)
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    height = profile.height_cm if profile else None
    sex = profile.sex if profile else None

    def to_day(day: date_type, steps: int) -> StepDay:
        return StepDay(day=day, steps=steps, calories=estimate_step_calories(steps, weight, height, sex))

    step_days = [to_day(row.step_date, row.steps) for row in rows]
    today_row = next((d for d in step_days if d.day == today), None)
    last_synced = max((row.updated_at for row in rows), default=None)
    if last_synced is None:
        # Pencere dışında eski veri olsa da "bağlı" sayılsın (ör. 10 gün açılmamış telefon).
        latest = (
            db.query(DailySteps.updated_at)
            .filter(DailySteps.user_id == user_id)
            .order_by(DailySteps.updated_at.desc())
            .first()
        )
        last_synced = latest[0] if latest else None
    return StepSummary(
        today=today_row or to_day(today, 0),
        days=step_days,
        average_steps=round(sum(d.steps for d in step_days) / len(step_days)) if step_days else None,
        last_synced_at=last_synced,
        has_data=last_synced is not None,
        weight_known=weight is not None,
        consented=has_steps_consent(db, user_id),
    )
