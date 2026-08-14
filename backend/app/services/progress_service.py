from dataclasses import dataclass
from datetime import date as date_type, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.progress_log import ProgressLog
from app.models.workout_session import WorkoutSession

VALID_WORKOUT_TYPES = {"kuvvet", "kardiyo", "esneklik", "karışık"}

# DB'deki antrenman türü anahtarları HER ZAMAN Türkçe (bkz. VALID_WORKOUT_TYPES) -
# bu sadece as_text(language="en") çıktısında görünen etikette kullanılır,
# frontend'deki WORKOUT_TYPE_LABELS ile aynı çeviri (bkz. web/mobile ui.tsx).
_WORKOUT_TYPE_LABELS_EN = {
    "kuvvet": "Strength",
    "kardiyo": "Cardio",
    "esneklik": "Flexibility",
    "karışık": "Mixed",
}


@dataclass
class WeeklySummary:
    # Bu hafta en az bir ilerleme kaydı (kilo/antrenman) girilmiş GÜN sayısı -
    # ham satır sayısı DEĞİL (2026-08-06'da mobil canlı testinde bulundu: aynı
    # gün birden fazla kilo girişi eskiden log_count'u yanıltıcı şekilde
    # şişiriyordu, ör. aynı gün 3 kez kilo girmek "3 kayıt" gösteriyordu).
    # Bu, streak'in "gün/hafta bazlı" mantığıyla ve WeightChart'ın aynı-gün
    # dedup kararıyla tutarlı - kullanıcı kararı: kaç KEZ değil, kaç GÜN.
    log_count: int
    workout_count: int
    workout_types: dict[str, int]
    weight_start: float | None
    weight_end: float | None
    weight_trend: float | None
    # Bu hafta dahil, en az bir ilerleme kaydı (kilo/antrenman) girilmiş kaç
    # hafta ÜST ÜSTE kesintisiz devam ediyor (bkz. calculate_weekly_streak) -
    # rekabet analizinden gelen "streak" önerisi, mevcut progress_logs
    # verisinden türetiliyor, yeni bir tablo gerekmiyor.
    streak_weeks: int = 0

    def as_text(self, language: str = "tr") -> str:
        """`language`: SADECE kullanıcıya GÖSTERİLEN metnin dilini seçer
        (bkz. UserProfile.preferred_language) - agent tool çağrıları bu
        parametreyi hiç vermez (varsayılan "tr"), çünkü onların çıktısı
        Türkçe-konuşan orchestrator LLM'ine bağlam olarak gidiyor, kullanıcıya
        doğrudan gösterilmiyor (Faz 3'ün henüz yapılmayan kapsamı)."""
        if language == "en":
            return self._as_text_en()
        return self._as_text_tr()

    def _as_text_tr(self) -> str:
        if self.log_count == 0:
            return "Son 7 günde herhangi bir ilerleme kaydı girilmemiş."

        parts = [f"Son 7 günde {self.workout_count} antrenman kaydedilmiş."]
        if self.workout_types:
            breakdown = ", ".join(f"{name}: {count}" for name, count in self.workout_types.items())
            parts.append(f"Antrenman türü dağılımı: {breakdown}.")
        if self.weight_start is not None and self.weight_end is not None:
            if self.weight_trend and self.weight_trend > 0:
                direction = f"{self.weight_trend:.1f} kg artmış"
            elif self.weight_trend and self.weight_trend < 0:
                direction = f"{abs(self.weight_trend):.1f} kg azalmış"
            else:
                direction = "değişmemiş"
            parts.append(
                f"Kilo {self.weight_start:.1f} kg'dan {self.weight_end:.1f} kg'a, yani {direction}."
            )
        if self.streak_weeks >= 2:
            parts.append(f"Üst üste {self.streak_weeks}. haftandır düzenli kayıt giriyorsun, harika gidiyor!")
        return " ".join(parts)

    def _as_text_en(self) -> str:
        if self.log_count == 0:
            return "No progress was logged in the last 7 days."

        parts = [f"You logged {self.workout_count} workouts in the last 7 days."]
        if self.workout_types:
            breakdown = ", ".join(
                f"{_WORKOUT_TYPE_LABELS_EN.get(name, name)}: {count}" for name, count in self.workout_types.items()
            )
            parts.append(f"Workout type breakdown: {breakdown}.")
        if self.weight_start is not None and self.weight_end is not None:
            if self.weight_trend and self.weight_trend > 0:
                direction = f"up {self.weight_trend:.1f} kg"
            elif self.weight_trend and self.weight_trend < 0:
                direction = f"down {abs(self.weight_trend):.1f} kg"
            else:
                direction = "unchanged"
            parts.append(f"Weight went from {self.weight_start:.1f} kg to {self.weight_end:.1f} kg, {direction}.")
        if self.streak_weeks >= 2:
            parts.append(f"You've logged consistently for {self.streak_weeks} weeks in a row, great job!")
        return " ".join(parts)


def _validate_measurement_ranges(
    weight: float | None, waist_cm: float | None, body_fat_pct: float | None
) -> None:
    """`log_progress` ve `update_progress_log` arasında paylaşılan aralık
    doğrulaması (2026-08-11 kullanıcı bulgusu, canlı test): sunucu
    tarafında bu 3 alan için hiç doğrulama yoktu - doğrudan API isteğiyle
    (frontend'in HTML min/max'ı bypass edilerek) waist_cm=-50 veya
    body_fat_pct=150 gibi fiziksel olarak imkansız değerler sorunsuz
    kaydediliyordu. Doğrulama BİLEREK burada (Pydantic şema katmanında
    değil) - workout_type kontrolüyle AYNI ilke: hem HTTP endpoint'i hem
    sohbet aracı (LLM'in hatalı çıkarım yapma ihtimali de var) AYNI
    korumayı alır, hata mesajı da AppValidationError üzerinden
    dil-duyarlı döner."""
    if weight is not None and not (0 < weight <= 500):
        raise AppValidationError("weight_out_of_range")
    if waist_cm is not None and not (0 < waist_cm <= 300):
        raise AppValidationError("waist_out_of_range")
    if body_fat_pct is not None and not (0 < body_fat_pct <= 100):
        raise AppValidationError("body_fat_out_of_range")


def log_progress(
    db: Session,
    user_id: int,
    weight: float | None = None,
    waist_cm: float | None = None,
    body_fat_pct: float | None = None,
    workout_completed: bool | None = None,
    workout_type: str | None = None,
    log_date: date_type | None = None,
) -> ProgressLog:
    """Kilo, opsiyonel vücut ölçümleri (bel çevresi/yağ oranı) ve/veya
    antrenman kaydı ekler. Hem Takip Agent tool'u hem de POST /progress/log
    endpoint'i bu fonksiyonu çağırır — tek iş mantığı katmanı."""
    if workout_type is not None and workout_type not in VALID_WORKOUT_TYPES:
        raise AppValidationError("invalid_workout_type", workout_type=workout_type)
    _validate_measurement_ranges(weight, waist_cm, body_fat_pct)

    entry = ProgressLog(
        user_id=user_id,
        weight=weight,
        waist_cm=waist_cm,
        body_fat_pct=body_fat_pct,
        workout_completed=bool(workout_completed),
        workout_type=workout_type if workout_completed else None,
        log_date=log_date or datetime.now(timezone.utc).date(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def delete_progress_log(db: Session, user_id: int, log_id: int) -> bool:
    """Bir ilerleme kaydını (kilo/bel çevresi/yağ oranı/antrenman işareti)
    siler. Bulunamazsa (ya da başka kullanıcıya aitse) False döner.
    2026-08-11 kullanıcı bulgusu: bu kayıtlar için ÖNCEDEN silme/düzenleme
    hiç yoktu (Antrenman/Beslenme kayıtlarının aksine)."""
    entry = db.query(ProgressLog).filter(ProgressLog.id == log_id, ProgressLog.user_id == user_id).first()
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True


def update_progress_log(
    db: Session,
    user_id: int,
    log_id: int,
    weight: float | None = None,
    waist_cm: float | None = None,
    body_fat_pct: float | None = None,
) -> ProgressLog | None:
    """Bir ilerleme kaydının kilo/bel çevresi/vücut yağ oranı alanlarını
    günceller (yanlış girilen bir değeri düzeltmek için, bkz.
    delete_progress_log docstring'i). Sadece VERİLEN alanlar değişir
    (`update_meal_entry` ile AYNI - None geçilen alan dokunulmadan kalır,
    profildeki "None mı yoksa hiç gönderilmedi mi" ayrımının gerektiği
    exclude_unset senaryosundan FARKLI - burada bir ölçümü kasıtlı olarak
    boşa çekmek anlamlı bir kullanıcı isteği değil). Bulunamazsa None döner."""
    entry = db.query(ProgressLog).filter(ProgressLog.id == log_id, ProgressLog.user_id == user_id).first()
    if entry is None:
        return None

    _validate_measurement_ranges(weight, waist_cm, body_fat_pct)

    if weight is not None:
        entry.weight = weight
    if waist_cm is not None:
        entry.waist_cm = waist_cm
    if body_fat_pct is not None:
        entry.body_fat_pct = body_fat_pct

    db.commit()
    db.refresh(entry)
    return entry


def get_latest_weight(db: Session, user_id: int) -> float | None:
    """Kullanıcının en son kaydettiği kilo değerini döner (yoksa None) -
    kardiyo/esneklik kalori tahmininde (workout_service.py) kullanılıyor.
    Aynı gün birden fazla kilo girişi olabildiği için (bkz. WeightChart
    dedup kararı) tarihe göre DEĞİL id'ye göre en son eklenen satır esas
    alınıyor - tutarlı bir "en güncel" tanımı."""
    entry = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.weight.isnot(None))
        .order_by(ProgressLog.id.desc())
        .first()
    )
    return entry.weight if entry is not None else None


def list_progress_logs(
    db: Session, user_id: int, days: int | None = None, limit: int | None = None, offset: int = 0
) -> list[ProgressLog]:
    """Kullanıcının ilerleme kayıtlarını tarih sırasıyla döndürür (grafik/tablo için).
    `days` verilirse sadece son o kadar günü, verilmezse tüm geçmişi döndürür.
    `limit` verilirse en yeni `limit` kaydı (varsa `offset` kadar atlayarak)
    döner - "Geçmiş Kayıtlar" listesinde kademeli yükleme ("Daha Fazla
    Göster") için (2026-08-14, kullanıcı isteği: uzun listeler mobilde
    görsel olarak bunaltıcıydı). `list_workout_sessions`'daki DESC+limit+
    reversed deseniyle AYNI - grafik/tablo için kullanılan `days` filtresi
    ile bu YENİ, bağımsız sayfalama BİRLİKTE de kullanılabilir ama pratikte
    frontend ikisini AYRI çağrılarda kullanır (grafik `days`, liste `limit`),
    KARIŞTIRILMAZ."""
    query = db.query(ProgressLog).filter(ProgressLog.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(ProgressLog.log_date >= since)
    if limit is not None:
        rows = (
            query.order_by(ProgressLog.log_date.desc(), ProgressLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return list(reversed(rows))
    return query.order_by(ProgressLog.log_date.asc()).all()


def calculate_weekly_streak(db: Session, user_id: int, today: date_type | None = None) -> int:
    """Bu hafta dahil, kullanıcının en az bir ilerleme kaydı (kilo,
    ProgressLog üzerinden basit antrenman işareti, ya da Antrenman
    sekmesinden detaylı bir WorkoutSession) girdiği kaç hafta ÜST ÜSTE
    (geriye doğru, kesintisiz) devam ettiğini hesaplar. Hafta sınırı
    Pazartesi-Pazar (ISO hafta). Son 52 haftalık pencereyle sınırlı - daha
    eskisi zaten streak'i bozmuş demektir, tüm geçmişi taramaya gerek yok.

    2026-08-06: WorkoutSession BİRLEŞİMİ eklendi - trend_service.py'deki
    generate_weekly_trends AYNI sınıf sorunu (antrenman iki ayrı yoldan
    kaydedilebiliyor) `workout_days` için daha önce düzeltmişti ama burası
    düzeltilmemiş kalmıştı. İlerleme sekmesinden "bugün antrenman yaptım"
    checkbox'ı kaldırılınca (Faz B) bu düzeltme olmadan Antrenman
    sekmesinden loglayan bir kullanıcının serisi sessizce sıfırda kalırdı."""
    today = today or datetime.now(timezone.utc).date()
    since = today - timedelta(weeks=52)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .all()
    )
    workout_sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date >= since)
        .all()
    )
    if not logs and not workout_sessions:
        return 0

    def week_start(d: date_type) -> date_type:
        return d - timedelta(days=d.weekday())

    logged_weeks = {week_start(log.log_date) for log in logs} | {
        week_start(session.session_date) for session in workout_sessions
    }

    streak = 0
    cursor = week_start(today)
    while cursor in logged_weeks:
        streak += 1
        cursor -= timedelta(weeks=1)
    return streak


def generate_weekly_summary(db: Session, user_id: int) -> WeeklySummary:
    """Son 7 günün özetini döndürür. Hem Takip Agent tool'u hem de
    GET /progress/weekly-summary endpoint'i hem de haftalık scheduler job'ı bu
    fonksiyonu çağırır — tek iş mantığı katmanı.

    2026-08-06: antrenman günü/türü artık ProgressLog.workout_completed
    VEYA WorkoutSession (Antrenman sekmesi) - hangisinden geldiğine
    bakılmaksızın BİRLEŞİM olarak sayılıyor (calculate_weekly_streak'teki
    aynı düzeltme, aynı gerekçe)."""
    since = datetime.now(timezone.utc).date() - timedelta(days=7)
    logs = (
        db.query(ProgressLog)
        .filter(ProgressLog.user_id == user_id, ProgressLog.log_date >= since)
        .order_by(ProgressLog.log_date.asc())
        .all()
    )
    workout_sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date >= since)
        .all()
    )

    workout_days_from_logs = {log.log_date for log in logs if log.workout_completed}
    workout_days_from_sessions = {session.session_date for session in workout_sessions}
    workout_days = workout_days_from_logs | workout_days_from_sessions

    workout_types: dict[str, int] = {}
    for log in logs:
        if log.workout_completed and log.workout_type:
            workout_types[log.workout_type] = workout_types.get(log.workout_type, 0) + 1
    for session in workout_sessions:
        if session.workout_type:
            workout_types[session.workout_type] = workout_types.get(session.workout_type, 0) + 1

    weight_logs = [log for log in logs if log.weight is not None]
    weight_start = weight_logs[0].weight if weight_logs else None
    weight_end = weight_logs[-1].weight if weight_logs else None
    weight_trend = (
        weight_end - weight_start if weight_start is not None and weight_end is not None else None
    )

    active_days = {log.log_date for log in logs} | workout_days_from_sessions

    return WeeklySummary(
        log_count=len(active_days),
        workout_count=len(workout_days),
        workout_types=workout_types,
        weight_start=weight_start,
        weight_end=weight_end,
        weight_trend=weight_trend,
        streak_weeks=calculate_weekly_streak(db, user_id),
    )


# Vücut kompozisyonu içgörüsü için eşikler (2026-08-11, kullanıcı onayladı,
# muhafazakar başlangıç değerleri - kesin tıbbi bir iddia değil, "olası bir
# işaret" tonunda kalınıyor).
_BODY_COMP_WEIGHT_FLAT_KG = 0.5
_BODY_COMP_WAIST_IMPROVED_CM = 1.0
_BODY_COMP_FAT_IMPROVED_PCT = 0.5
_BODY_COMP_MIN_GAP_DAYS = 14
_BODY_COMP_LOOKBACK_DAYS = 90


def get_body_composition_insight(db: Session, user_id: int, language: str = "tr") -> str | None:
    """Kilo tek başına yanıltıcı olabilir (kas artarken kilo sabit
    kalabilir/artabilir) - kullanıcı kilonun YANINDA bel çevresi ve/veya
    vücut yağ oranını da girdiyse, tartının tek başına göstermediği bir
    ilerlemeyi (ya da kas kazanımı olasılığını) fark edip NAZİKÇE hatırlatır
    (2026-08-11, kullanıcı isteği). Haftalık özetin sabit 7 günlük
    penceresinden BİLEREK farklı - bu ölçümler kilodan çok daha seyrek
    girilir, anlamlı bir karşılaştırma için son 90 günde aralarında en az 14
    gün olan İLK ve SON (weight + waist/body_fat birlikte girilmiş) kayıt
    kullanılır.

    Sadece 2 senaryoda bir mesaj döner (muhafazakar eşikler, kesin tıbbi
    iddia değil - 'olası bir işarettir' tonunda):
    1. Kilo ~sabit (±0.5kg) AMA bel ≥1cm azalmış VEYA yağ oranı ≥0.5 puan
       azalmış - tartının göstermediği ilerleme.
    2. Kilo artmış (>0.5kg) AMA bel/yağ oranı yukarıdaki gibi iyileşmiş -
       muhtemelen kas kazanımı, kilo artışı olumsuz yorumlanmasın diye
       (özellikle "kas yapmak" hedefindeki kullanıcılar için değerli).
    Diğer durumlarda (veri yetersiz, anlamlı bir sapma yok, kilo azalmış -
    zaten olumlu/beklenen bir sonuç, ayrıca vurgulanmaya gerek yok) None
    döner - kart hiç görünmez, "her açılışta bir şeyler söyleme" yorgunluğu
    yaratılmaz."""
    since = datetime.now(timezone.utc).date() - timedelta(days=_BODY_COMP_LOOKBACK_DAYS)
    rows = (
        db.query(ProgressLog)
        .filter(
            ProgressLog.user_id == user_id,
            ProgressLog.log_date >= since,
            ProgressLog.weight.isnot(None),
            (ProgressLog.waist_cm.isnot(None)) | (ProgressLog.body_fat_pct.isnot(None)),
        )
        .order_by(ProgressLog.log_date.asc(), ProgressLog.id.asc())
        .all()
    )
    if len(rows) < 2:
        return None

    first, last = rows[0], rows[-1]
    if (last.log_date - first.log_date).days < _BODY_COMP_MIN_GAP_DAYS:
        return None

    weight_delta = last.weight - first.weight
    waist_delta = (
        last.waist_cm - first.waist_cm
        if first.waist_cm is not None and last.waist_cm is not None
        else None
    )
    fat_delta = (
        last.body_fat_pct - first.body_fat_pct
        if first.body_fat_pct is not None and last.body_fat_pct is not None
        else None
    )

    waist_improved = waist_delta is not None and waist_delta <= -_BODY_COMP_WAIST_IMPROVED_CM
    fat_improved = fat_delta is not None and fat_delta <= -_BODY_COMP_FAT_IMPROVED_PCT
    if not waist_improved and not fat_improved:
        return None

    if abs(weight_delta) <= _BODY_COMP_WEIGHT_FLAT_KG:
        scenario = "flat"
    elif weight_delta > _BODY_COMP_WEIGHT_FLAT_KG:
        scenario = "gain"
    else:
        # Kilo zaten azalmış - beklenen/olumlu bir sonuç, mevcut kilo
        # trendi grafiği/hedefi bunu zaten gösteriyor, ayrıca vurgulanmaya
        # gerek yok.
        return None

    return _body_composition_message(
        scenario,
        weight_delta,
        waist_delta if waist_improved else None,
        fat_delta if fat_improved else None,
        language,
    )


def _body_composition_message(
    scenario: str,
    weight_delta: float,
    waist_delta: float | None,
    fat_delta: float | None,
    language: str,
) -> str:
    if language == "en":
        detail_parts = []
        if waist_delta is not None:
            detail_parts.append(f"your waist is down {abs(waist_delta):.1f} cm")
        if fat_delta is not None:
            detail_parts.append(f"your body fat % is down {abs(fat_delta):.1f} points")
        detail = " and ".join(detail_parts)
        if scenario == "flat":
            return (
                f"Your weight hasn't changed much recently, but {detail} — "
                "this can be real progress the scale alone doesn't show!"
            )
        return (
            f"Your weight is up about {weight_delta:.1f} kg recently, but {detail} — "
            "this is often a sign of muscle gain, so there's no need to read the weight increase negatively."
        )

    detail_parts = []
    if waist_delta is not None:
        detail_parts.append(f"belin {abs(waist_delta):.1f} cm azalmış")
    if fat_delta is not None:
        detail_parts.append(f"vücut yağ oranın {abs(fat_delta):.1f} puan azalmış")
    detail = " ve ".join(detail_parts)
    if scenario == "flat":
        return (
            f"Kilon son zamanlarda pek değişmemiş görünüyor ama {detail} — "
            "bu, tartının tek başına göstermediği gerçek bir ilerleme olabilir!"
        )
    return (
        f"Kilon son zamanlarda yaklaşık {weight_delta:.1f} kg artmış ama {detail} — "
        "bu genelde kas kazanımının bir işareti olabilir, kilo artışını olumsuz yorumlamana gerek yok."
    )
