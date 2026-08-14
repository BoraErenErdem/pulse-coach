import math
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services import met_reference, notification_service
from app.services.fuzzy_match import tr_lower
from app.services.progress_service import VALID_WORKOUT_TYPES, get_latest_weight, log_progress


@dataclass
class SetInput:
    """Bir set YA reps [+opsiyonel weight_kg] YA DA duration_minutes
    [+intensity+cardio_category] taşır (mutually exclusive, kardiyo/esneklik
    süre bazlı girişi için 2026-08-06'da eklendi - bkz. met_reference.py).
    reps None ama duration_minutes de None ise `_validate_set_fields`
    ValueError fırlatır."""

    exercise_name: str
    reps: int | None = None
    weight_kg: float | None = None
    set_number: int | None = None
    exercise_catalog_id: int | None = None
    duration_minutes: float | None = None
    intensity: str | None = None
    cardio_category: str | None = None


def _validate_set_fields(
    reps: int | None, duration_minutes: float | None, intensity: str | None, cardio_category: str | None
) -> None:
    """Bir setin NİHAİ (create'te girilen ya da update'te kısmi güncelleme
    sonrası oluşan) reps/duration/intensity/cardio_category kombinasyonunun
    geçerliliğini kontrol eder - hem `log_workout_session` (create) hem
    `update_workout_set` (PATCH) bu TEK fonksiyonu çağırır, aksi halde PATCH
    yolu create'teki kontrollerden muaf kalır (2026-08-13 tutarlılık
    incelemesinde bulundu - PATCH ile negatif reps/geçersiz intensity
    sorunsuz kabul ediliyordu)."""
    is_duration_based = duration_minutes is not None
    if is_duration_based:
        if intensity not in met_reference.VALID_INTENSITIES:
            raise AppValidationError("invalid_intensity", intensity=intensity)
        if cardio_category not in met_reference.VALID_CARDIO_CATEGORIES:
            raise AppValidationError("invalid_cardio_category", cardio_category=cardio_category)
        if duration_minutes <= 0:
            raise AppValidationError("duration_must_be_positive")
    elif reps is None:
        raise AppValidationError("set_needs_reps_or_duration")
    elif reps <= 0:
        raise AppValidationError("reps_must_be_positive")


def _calories_for_set(db: Session, user_id: int, set_input: "SetInput") -> float | None:
    if set_input.duration_minutes is None:
        return None
    latest_weight = get_latest_weight(db, user_id)
    return met_reference.estimate_calories(
        set_input.cardio_category, set_input.intensity, set_input.duration_minutes, latest_weight
    )


@dataclass
class WorkoutSummary:
    session_count: int
    total_sets: int
    total_volume_kg: float
    sets_by_exercise: dict[str, int] = field(default_factory=dict)
    # Sadece as_text()'te "Son X günde" ifadesi için - `days` her zaman 7
    # olmayabiliyor (endpoint/chat tool farklı bir değer geçebiliyor),
    # önceden belirsiz "Bu dönemde" ifadesi bunun yerine kullanılıyordu
    # (2026-08-06, mobil canlı testinde "daha anlaşılır olsun" istendi).
    days: int = 7
    # Süre bazlı (kardiyo/esneklik) setlerin MET tahminlerinin toplamı -
    # kilo kaydı olmayan setler hesaba katılmadığı için tam olmayabilir,
    # bu yüzden as_text()'te "tahmini" olarak belirtiliyor.
    total_calories_burned: float = 0.0

    def as_text(self, language: str = "tr") -> str:
        """`language`: SADECE kullanıcıya GÖSTERİLEN metnin dilini seçer
        (bkz. UserProfile.preferred_language) - agent tool çağrıları bu
        parametreyi hiç vermez (varsayılan "tr"), çünkü onların çıktısı
        Türkçe-konuşan orchestrator LLM'ine bağlam olarak gidiyor, kullanıcıya
        doğrudan gösterilmiyor (Faz 3'ün henüz yapılmayan kapsamı). Egzersiz
        isimleri (sets_by_exercise anahtarları) burada ÇEVRİLMEZ - loglama
        anında zaten kullanıcının dil tercihine göre seçilmiş kanonik isim
        olarak kaydedilmişlerdi (bkz. exercise_catalog_service.canonical_name)."""
        if language == "en":
            return self._as_text_en()
        return self._as_text_tr()

    def _as_text_tr(self) -> str:
        if self.session_count == 0:
            return f"Son {self.days} günde herhangi bir detaylı antrenman kaydı girilmemiş."

        parts = [f"Son {self.days} günde {self.session_count} antrenman oturumu tamamladın, toplam {self.total_sets} set."]
        if self.total_volume_kg > 0:
            parts.append(f"Kaldırdığın toplam ağırlık (tüm setlerin toplamı): {self.total_volume_kg:.0f} kg.")
        if self.total_calories_burned > 0:
            parts.append(f"Kardiyo/esneklikte yaktığın tahmini kalori: {self.total_calories_burned:.0f} kcal.")
        if self.sets_by_exercise:
            top = sorted(self.sets_by_exercise.items(), key=lambda item: item[1], reverse=True)[:5]
            breakdown = ", ".join(f"{name} ({count} set)" for name, count in top)
            parts.append(f"En çok çalıştığın egzersizler: {breakdown}.")
        return " ".join(parts)

    def _as_text_en(self) -> str:
        if self.session_count == 0:
            return f"No detailed workout was logged in the last {self.days} days."

        parts = [f"You completed {self.session_count} workout sessions in the last {self.days} days, {self.total_sets} sets total."]
        if self.total_volume_kg > 0:
            parts.append(f"Total weight lifted (sum of all sets): {self.total_volume_kg:.0f} kg.")
        if self.total_calories_burned > 0:
            parts.append(f"Estimated calories burned in cardio/flexibility: {self.total_calories_burned:.0f} kcal.")
        if self.sets_by_exercise:
            top = sorted(self.sets_by_exercise.items(), key=lambda item: item[1], reverse=True)[:5]
            breakdown = ", ".join(f"{name} ({count} sets)" for name, count in top)
            parts.append(f"Your most-worked exercises: {breakdown}.")
        return " ".join(parts)


def _best_before(
    db: Session,
    user_id: int,
    exercise_catalog_id: int | None,
    exercise_name: str,
    exclude_set_id: int | None = None,
) -> tuple[float | None, int | None, dict[float, int]]:
    """Kullanıcının bir egzersizdeki önceki en iyi ağırlıklı ve vücut
    ağırlığıyla (weight_kg boş) kaydını döner: (en_agir_kg, en_cok_tekrar,
    agirlik_basina_en_cok_tekrar). Kişisel rekor tespitinde hem
    `log_single_set`/`log_workout_session` (yeni set eklerken) hem
    `update_workout_set` (mevcut bir seti düzenlerken, kendisi hariç) bu
    fonksiyonu kullanır.

    Eşleşme SADECE exercise_catalog_id'ye göre YAPILMAZ: web formundan
    girilen setler hiç katalog eşlemesi yapmıyor (exercise_catalog_id=None),
    chat aracıysa fuzzy-match ile bir katalog ID'si çözüyor — aynı isimle
    ("Squat") girilen setler bu yüzden iki farklı yoldan farklı ID alabilir.
    Bu durumda katı bir ID/isim ayrımı, aynı egzersizin geçmişini "koparıp"
    rekor kıyaslamasını yanlış sonuçlandırır. Bu yüzden bir set, YA
    exercise_catalog_id eşleşiyorsa YA DA ismi (Türkçe-doğru `tr_lower()`
    ile) eşleşiyorsa geçmişe dahil edilir (SQLite'ın yerleşik lower()
    fonksiyonu ASCII-only olduğu için isim karşılaştırması SQL'de değil
    Python'da yapılıyor — bkz. mood_support_agent/fuzzy_match.py'de daha
    önce bulunan aynı sınıf bug)."""
    query = (
        db.query(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user_id)
    )
    if exclude_set_id is not None:
        query = query.filter(WorkoutSet.id != exclude_set_id)

    target_name = tr_lower(exercise_name.strip())
    rows = [
        row
        for row in query.all()
        if (exercise_catalog_id is not None and row.exercise_catalog_id == exercise_catalog_id)
        or tr_lower(row.exercise_name_snapshot.strip()) == target_name
    ]

    best_weight_kg = max((row.weight_kg for row in rows if row.weight_kg is not None), default=None)
    # reps None olabilir (süre bazlı kardiyo/esneklik seti, 2026-08-06) -
    # bodyweight PR kıyaslaması bunları YOK SAYAR (PR mantığı bu turda
    # sadece reps-tabanlı setleri kapsıyor, bkz. _is_new_record).
    best_bodyweight_reps = max(
        (row.reps for row in rows if row.weight_kg is None and row.reps is not None), default=None
    )
    # Her ayrı ağırlık değeri için görülen en yüksek tekrar sayısı - "aynı
    # ağırlıkla daha fazla tekrar da rekor sayılsın" (kullanıcı isteği,
    # 2026-08-13, ör. 100kg×5 -> 100kg×6). Sadece ağırlıklı setleri kapsar.
    reps_by_weight: dict[float, int] = {}
    for row in rows:
        if row.weight_kg is not None and row.reps is not None:
            current = reps_by_weight.get(row.weight_kg)
            if current is None or row.reps > current:
                reps_by_weight[row.weight_kg] = row.reps
    return best_weight_kg, best_bodyweight_reps, reps_by_weight


def _is_new_record(
    reps: int | None,
    weight_kg: float | None,
    best_weight_kg: float | None,
    best_bodyweight_reps: int | None,
    best_reps_at_weight: int | None = None,
) -> bool:
    """Ağırlıklı bir set İKİ yoldan rekor sayılabilir: (1) önceki en ağır
    kayıttan DAHA AĞIR, YA DA (2) daha önce de yapılmış AYNI ağırlıkta
    önceki en iyi tekrar sayısından DAHA FAZLA tekrar (2026-08-13 kullanıcı
    isteği - ör. 100kg×5 kişisel rekordu, 100kg×6 da rekor sayılmalı).
    Vücut ağırlığı seti (weight_kg yok) için önceki en çok tekrardan DAHA
    FAZLA tekrar mı diye bakar. Egzersizin hiç önceki kaydı yoksa (ilk kez
    yapılıyorsa) kasıtlı olarak rekor SAYILMAZ — kıyaslanacak bir temel
    olmadan "rekor kırıldı" demek yanıltıcı olur (best_reps_at_weight de bu
    durumda None olacağından ikinci yol da doğal olarak False döner).

    Süre bazlı (reps=None) setler için PR kavramı bu turda kapsam dışı -
    her zaman False döner (ör. "en uzun süre" PR'ı sonraki bir iyileştirme)."""
    if reps is None:
        return False
    if weight_kg is not None:
        if best_weight_kg is not None and weight_kg > best_weight_kg:
            return True
        return best_reps_at_weight is not None and reps > best_reps_at_weight
    return best_bodyweight_reps is not None and reps > best_bodyweight_reps


def log_workout_session(
    db: Session,
    user_id: int,
    sets: list[SetInput],
    session_date: date_type | None = None,
    workout_type: str | None = None,
    note: str | None = None,
) -> WorkoutSession:
    """Set/tekrar/ağırlık bazlı bir antrenman oturumu kaydeder. Hem Antrenman
    Takip Agent tool'u hem de POST /workouts/sessions endpoint'i bu
    fonksiyonu çağırır — tek iş mantığı katmanı.

    Mevcut basit ProgressLog (kaba workout_completed/workout_type) otomatik
    senkronize edilir ki haftalık özet/motivasyon agent'ı bozulmadan çalışmaya
    devam etsin."""
    if workout_type is not None and workout_type not in VALID_WORKOUT_TYPES:
        raise AppValidationError("invalid_workout_type", workout_type=workout_type)
    if not sets:
        raise AppValidationError("at_least_one_set_required")

    resolved_date = session_date or datetime.now(timezone.utc).date()

    session = WorkoutSession(user_id=user_id, session_date=resolved_date, workout_type=workout_type, note=note)
    db.add(session)
    db.flush()  # session.id gerekiyor

    counters: dict[str, int] = {}
    # Ayni istekte (bulk) ayni egzersizin birden fazla seti gelebilir; bu
    # yuzden her setten sonra en iyisini bellekte guncelleyip bir sonraki
    # sete o guncel degerle kiyaslamak gerekiyor (DB henuz commit edilmedi).
    running_best: dict[str, tuple[float | None, int | None, dict[float, int]]] = {}
    # PR/hedef push bildirimi commit SONRASI gönderilmeli (workout_set.id
    # gerekiyor) - bu yüzden aday setler + o ANKİ (running_best güncellenmeden
    # ÖNCEKİ) en iyi ağırlık burada biriktirilip döngü bitince tek seferde
    # işlenir (bkz. notification_service.notify_set_logged).
    pr_candidates: list[tuple[WorkoutSet, bool, float | None]] = []
    for set_input in sets:
        _validate_set_fields(
            set_input.reps, set_input.duration_minutes, set_input.intensity, set_input.cardio_category
        )
        # Türkçe-doğru normalize TEK SEFERDE burada yapılır (tr_lower ham
        # isim üzerinde çalışmalı - önceden burada düz .lower() kullanılıp
        # sonucu AYRICA tr_lower'a veriliyordu, ama .lower()'ın bozduğu "İ"
        # zaten kaybolduğu için tr_lower'ın .replace("İ","i") adımı hiçbir
        # şeyi düzeltemiyordu; aynı istekte "İp Atlama"/"ip atlama" karışık
        # yazılırsa set numaraları ve PR karşılaştırması ayrışıyordu, bkz.
        # proje belleği). counters VE running_best artık AYNI tr_lower'lı
        # `key`'i paylaşıyor.
        key = tr_lower(set_input.exercise_name.strip())
        set_number = set_input.set_number
        if set_number is None:
            counters[key] = counters.get(key, 0) + 1
            set_number = counters[key]

        is_duration_based = set_input.duration_minutes is not None
        is_pr = False
        estimated_calories = None

        if is_duration_based:
            estimated_calories = _calories_for_set(db, user_id, set_input)
        else:
            # _best_before isim VEYA katalog ID eşleşmesiyle (OR) çalıştığı
            # için burada da tutarlı olarak isimle (Türkçe-doğru) grupluyoruz.
            if key not in running_best:
                running_best[key] = _best_before(
                    db, user_id, set_input.exercise_catalog_id, set_input.exercise_name
                )
            best_weight_kg, best_bodyweight_reps, reps_by_weight = running_best[key]
            best_reps_at_weight = (
                reps_by_weight.get(set_input.weight_kg) if set_input.weight_kg is not None else None
            )

            is_pr = _is_new_record(
                set_input.reps, set_input.weight_kg, best_weight_kg, best_bodyweight_reps, best_reps_at_weight
            )
            # Rekor olarak İŞARETLENMESE bile (ör. bu egzersizin ilk seti,
            # kıyaslanacak bir temel yok), bu set aynı istekteki SONRAKİ
            # setler için artık bilinen en iyi değer haline gelir.
            if set_input.weight_kg is not None:
                new_best_weight = (
                    set_input.weight_kg if best_weight_kg is None else max(best_weight_kg, set_input.weight_kg)
                )
                if best_reps_at_weight is None or set_input.reps > best_reps_at_weight:
                    reps_by_weight[set_input.weight_kg] = set_input.reps
                running_best[key] = (new_best_weight, best_bodyweight_reps, reps_by_weight)
            else:
                new_best_reps = (
                    set_input.reps if best_bodyweight_reps is None else max(best_bodyweight_reps, set_input.reps)
                )
                running_best[key] = (best_weight_kg, new_best_reps, reps_by_weight)

        workout_set = WorkoutSet(
            session_id=session.id,
            exercise_catalog_id=set_input.exercise_catalog_id,
            exercise_name_snapshot=set_input.exercise_name,
            set_number=set_number,
            reps=set_input.reps,
            weight_kg=set_input.weight_kg,
            duration_minutes=set_input.duration_minutes,
            intensity=set_input.intensity,
            cardio_category=set_input.cardio_category,
            estimated_calories=estimated_calories,
            is_personal_record=is_pr,
        )
        db.add(workout_set)
        if not is_duration_based:
            pr_candidates.append((workout_set, is_pr, best_weight_kg))

    db.commit()
    db.refresh(session)

    log_progress(
        db,
        user_id,
        workout_completed=True,
        workout_type=workout_type,
        log_date=resolved_date,
    )

    # Toplu oturumda birden fazla PR/hedef push'u art arda ateşlenebilir
    # (bilinçli kabul edilen davranış - dedup istenmiyor, bkz. plan).
    for candidate_set, candidate_is_pr, candidate_best_before in pr_candidates:
        notification_service.notify_set_logged(
            db, user_id, candidate_set, candidate_is_pr, candidate_best_before
        )

    return session


def get_or_create_open_session(
    db: Session,
    user_id: int,
    session_date: date_type | None = None,
    workout_type: str | None = None,
) -> tuple[WorkoutSession, bool]:
    """Belirtilen (verilmezse bugünün) günü için kullanıcının açık bir
    antrenman oturumu varsa onu döner, yoksa yenisini oluşturur. İkinci
    değer, oturumun YENİ oluşturulup oluşturulmadığını belirtir —
    `log_single_set` bunu ProgressLog senkronunu sadece oturum başına bir kez
    tetiklemek için kullanır (her tek set çağrısında değil)."""
    resolved_date = session_date or datetime.now(timezone.utc).date()
    session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id, WorkoutSession.session_date == resolved_date)
        .order_by(WorkoutSession.created_at.desc())
        .first()
    )
    if session is not None:
        if workout_type is not None and session.workout_type is None:
            session.workout_type = workout_type
            db.commit()
            db.refresh(session)
        return session, False

    if workout_type is not None and workout_type not in VALID_WORKOUT_TYPES:
        raise AppValidationError("invalid_workout_type", workout_type=workout_type)

    session = WorkoutSession(user_id=user_id, session_date=resolved_date, workout_type=workout_type)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, True


def log_single_set(
    db: Session,
    user_id: int,
    exercise_name: str,
    reps: int,
    weight_kg: float | None = None,
    exercise_catalog_id: int | None = None,
    session_date: date_type | None = None,
    workout_type: str | None = None,
) -> WorkoutSet:
    """Sohbet üzerinden tek tek gelen setleri, aynı güne ait açık bir
    oturuma ekler (her set için ayrı bir WorkoutSession oluşturmaz).
    Antrenman Takip Agent'ın `log_exercise_set` tool'u bu fonksiyonu çağırır
    — yapılandırılmış form ise tüm setleri tek seferde bilen
    `log_workout_session`'ı kullanır."""
    session, created = get_or_create_open_session(db, user_id, session_date, workout_type)

    # tr_lower - düz .lower() Türkçe büyük "İ"yi yanlış küçültüp aynı egzersiz
    # "İp Atlama"/"ip atlama" karışık yazılırsa set numaralandırmasını
    # bölüyordu (log_workout_session'da AYNI bug'ın düzeltmesi vardı, bu
    # kardeş fonksiyon 2026-08-13 tutarlılık incelemesinde eksik bulundu).
    key = tr_lower(exercise_name.strip())
    existing_count = sum(1 for s in session.sets if tr_lower(s.exercise_name_snapshot.strip()) == key)

    best_weight_kg, best_bodyweight_reps, reps_by_weight = _best_before(db, user_id, exercise_catalog_id, exercise_name)
    best_reps_at_weight = reps_by_weight.get(weight_kg) if weight_kg is not None else None
    is_pr = _is_new_record(reps, weight_kg, best_weight_kg, best_bodyweight_reps, best_reps_at_weight)

    workout_set = WorkoutSet(
        session_id=session.id,
        exercise_catalog_id=exercise_catalog_id,
        exercise_name_snapshot=exercise_name,
        set_number=existing_count + 1,
        reps=reps,
        weight_kg=weight_kg,
        is_personal_record=is_pr,
    )
    db.add(workout_set)
    db.commit()
    db.refresh(workout_set)

    if created:
        log_progress(
            db,
            user_id,
            workout_completed=True,
            workout_type=session.workout_type,
            log_date=session.session_date,
        )

    notification_service.notify_set_logged(db, user_id, workout_set, is_pr, best_weight_kg)

    return workout_set


def list_workout_sessions(
    db: Session, user_id: int, days: int | None = None, limit: int | None = None, offset: int = 0
) -> list[WorkoutSession]:
    """Kullanıcının antrenman oturumlarını (set'leriyle birlikte) tarih
    sırasıyla döndürür. `days` verilirse sadece son o kadar günü, `limit`
    verilirse en fazla o kadar (en yeni) oturumu, `offset` ile birlikte
    kullanılırsa sayfalama yapar ("Daha Fazla Göster" - 2026-08-14 kullanıcı
    isteği, geçmiş listeleri uzayınca görsel olarak bunaltıcı olmasın diye)."""
    query = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(WorkoutSession.session_date >= since)
    if limit is not None:
        # en yeni N kayıt isteniyor - tarihe (ve aynı gün birden fazla
        # session olabildiği için id'ye) göre TERSTEN al, sonra tekrar
        # eskiden-yeniye çevir (frontend'in beklediği sıralama bozulmasın
        # diye). İkincil id sıralaması sayfa sınırında tekrar/atlama
        # olmamasını garanti eder (offset eklenince önem kazandı).
        rows = (
            query.order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return list(reversed(rows))
    return query.order_by(WorkoutSession.session_date.asc()).all()


def get_workout_session(db: Session, user_id: int, session_id: int) -> WorkoutSession | None:
    """Tek bir antrenman oturumunu (set'leriyle birlikte) döner. Bulunamazsa
    (ya da başka kullanıcıya aitse) None döner."""
    return (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .first()
    )


def delete_workout_session(db: Session, user_id: int, session_id: int) -> bool:
    """Bir antrenman oturumunu (ve cascade ile tüm set'lerini) siler.
    Bulunamazsa (ya da başka kullanıcıya aitse) False döner."""
    session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .first()
    )
    if session is None:
        return False
    db.delete(session)
    db.commit()
    return True


def update_workout_session(
    db: Session,
    user_id: int,
    session_id: int,
    workout_type: str | None = None,
    note: str | None = None,
) -> WorkoutSession | None:
    """Bir antrenman oturumunun metadata'sını (tür/not) günceller — set'lere
    dokunmaz. Bulunamazsa None döner."""
    session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .first()
    )
    if session is None:
        return None
    if workout_type is not None:
        if workout_type not in VALID_WORKOUT_TYPES:
            raise AppValidationError("invalid_workout_type", workout_type=workout_type)
        session.workout_type = workout_type
    if note is not None:
        session.note = note
    db.commit()
    db.refresh(session)
    return session


def _get_owned_set(db: Session, user_id: int, session_id: int, set_id: int) -> WorkoutSet | None:
    return (
        db.query(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(
            WorkoutSet.id == set_id,
            WorkoutSet.session_id == session_id,
            WorkoutSession.user_id == user_id,
        )
        .first()
    )


def delete_workout_set(db: Session, user_id: int, session_id: int, set_id: int) -> bool:
    """Bir oturumdaki tek bir seti siler. Bulunamazsa (ya da başka
    kullanıcıya aitse) False döner."""
    workout_set = _get_owned_set(db, user_id, session_id, set_id)
    if workout_set is None:
        return False
    db.delete(workout_set)
    db.commit()
    return True


def update_workout_set(
    db: Session,
    user_id: int,
    session_id: int,
    set_id: int,
    reps: int | None = None,
    weight_kg: float | None = None,
    duration_minutes: float | None = None,
    intensity: str | None = None,
    cardio_category: str | None = None,
) -> WorkoutSet | None:
    """Bir oturumdaki tek bir setin tekrar/ağırlık YA DA süre/yoğunluk/
    kategori değerini günceller. Bulunamazsa None döner."""
    workout_set = _get_owned_set(db, user_id, session_id, set_id)
    if workout_set is None:
        return None
    if reps is not None:
        workout_set.reps = reps
    if weight_kg is not None:
        workout_set.weight_kg = weight_kg
    if duration_minutes is not None:
        workout_set.duration_minutes = duration_minutes
    if intensity is not None:
        workout_set.intensity = intensity
    if cardio_category is not None:
        workout_set.cardio_category = cardio_category

    # Kısmi güncelleme sonrası oluşan NİHAİ kombinasyonu doğrula - create
    # yolundaki (`log_workout_session`) kontrollerle AYNI fonksiyon, PATCH'in
    # bu kontrollerden muaf kalmasını önler (2026-08-13 tutarlılık
    # incelemesinde bulundu).
    _validate_set_fields(
        workout_set.reps, workout_set.duration_minutes, workout_set.intensity, workout_set.cardio_category
    )

    best_weight_kg_before: float | None = None
    if workout_set.duration_minutes is not None:
        # Süre/yoğunluk/kategori değişmiş olabilir - kalori tahmini yeniden
        # hesaplanır (PR mantığı devreye girmez, _is_new_record reps=None
        # için zaten False dönüyor).
        workout_set.estimated_calories = met_reference.estimate_calories(
            workout_set.cardio_category,
            workout_set.intensity,
            workout_set.duration_minutes,
            get_latest_weight(db, user_id),
        )
    else:
        best_weight_kg, best_bodyweight_reps, reps_by_weight = _best_before(
            db,
            user_id,
            workout_set.exercise_catalog_id,
            workout_set.exercise_name_snapshot,
            exclude_set_id=workout_set.id,
        )
        best_weight_kg_before = best_weight_kg
        best_reps_at_weight = (
            reps_by_weight.get(workout_set.weight_kg) if workout_set.weight_kg is not None else None
        )
        workout_set.is_personal_record = _is_new_record(
            workout_set.reps, workout_set.weight_kg, best_weight_kg, best_bodyweight_reps, best_reps_at_weight
        )

    db.commit()
    db.refresh(workout_set)

    if workout_set.duration_minutes is None:
        notification_service.notify_set_logged(
            db, user_id, workout_set, workout_set.is_personal_record, best_weight_kg_before
        )

    return workout_set


def generate_workout_summary(db: Session, user_id: int, days: int = 7) -> WorkoutSummary:
    """Son `days` günün antrenman özetini döndürür. Hem Antrenman Takip Agent
    tool'u hem de GET /workouts/summary endpoint'i bu fonksiyonu çağırır."""
    sessions = list_workout_sessions(db, user_id, days=days)

    total_sets = 0
    total_volume_kg = 0.0
    total_calories_burned = 0.0
    # Aynı egzersiz chat'ten (fuzzy eşleşmezse exercise_catalog_id=None, ham
    # isim) ile formdan (katalog seçimi, exercise_catalog_id dolu) farklı
    # şekilde kaydedilebiliyor - düz isim metnine göre gruplamak bunları
    # istatistikte İKİ AYRI egzersiz gibi gösteriyordu. _best_before'daki
    # aynı "katalog ID VEYA isim eşleşmesi" (OR) mantığını burada da
    # uyguluyoruz - iki kayıt, ID'leri ya da (Türkçe-doğru) isimleri
    # eşleşiyorsa aynı grupta sayılır.
    groups: list[dict] = []

    for session in sessions:
        for workout_set in session.sets:
            total_sets += 1
            if workout_set.weight_kg and workout_set.reps:
                total_volume_kg += workout_set.reps * workout_set.weight_kg
            if workout_set.estimated_calories:
                total_calories_burned += workout_set.estimated_calories

            name = workout_set.exercise_name_snapshot
            name_key = tr_lower(name.strip())
            catalog_id = workout_set.exercise_catalog_id

            group = next(
                (
                    g
                    for g in groups
                    if (catalog_id is not None and catalog_id in g["catalog_ids"]) or name_key in g["names"]
                ),
                None,
            )
            if group is None:
                group = {"catalog_ids": set(), "names": set(), "display_name": name, "count": 0}
                groups.append(group)
            if catalog_id is not None:
                group["catalog_ids"].add(catalog_id)
            group["names"].add(name_key)
            group["count"] += 1

    sets_by_exercise = {g["display_name"]: g["count"] for g in groups}

    # 2026-08-12 canlı testte bulundu: total_volume_kg burada ham (yuvarlanmamış)
    # float olarak tutulup İKİ AYRI yerde bağımsız yuvarlanıyordu - as_text()
    # Python'ın `{:.0f}` formatı (tam-sayı .5 durumlarında round-half-to-even),
    # web/mobil StatTile ise JS'in `toFixed(0)`'ı (round-half-away-from-zero)
    # ile. Aynı sayı (ör. 1950.5) iki yuvarlama kuralına göre FARKLI tam
    # sayıya yuvarlanabiliyordu (1950 vs 1951), stat kutusu ile içgörü
    # metninin tutarsız görünmesine yol açıyordu. Kalıcı düzeltme: tek bir
    # yuvarlama TEK YERDE (burada, half-up) yapılıp sonuç zaten tam sayı
    # olarak döndürülüyor - hem as_text()'teki `.0f` hem frontend'teki
    # `toFixed(0)` artık zaten-tam-sayı bir değer üzerinde çalıştığı için
    # ikisi de aynı sonucu üretmek zorunda.
    total_volume_kg = float(math.floor(total_volume_kg + 0.5))

    return WorkoutSummary(
        session_count=len(sessions),
        total_sets=total_sets,
        total_volume_kg=total_volume_kg,
        sets_by_exercise=sets_by_exercise,
        days=days,
        total_calories_burned=total_calories_burned,
    )


# --- Egzersiz Geçmişi / Kendi-Kendine Kıyaslama (2026-08-13 kullanıcı isteği) ---
# "Egzersizlerim" listesi + tek bir egzersizin haftalık/aylık en iyi setini
# ÖNCEKİ dönemle kıyaslar. Her egzersiz SADECE kendi geçmişiyle kıyaslanır
# (ör. sırt hareketi göğüs hareketiyle karışmaz) - gruplama _best_before'daki
# AYNI tr_lower isim deseniyle yapılır, yeni bir tablo GEREKMEDİ, tamamen
# mevcut WorkoutSet/WorkoutSession üzerinden hesaplanıyor.


@dataclass
class LoggedExercise:
    exercise_name: str
    exercise_catalog_id: int | None
    set_count: int
    last_logged: date_type


@dataclass
class ExercisePeriodStat:
    period_start: date_type
    period_end: date_type
    top_weight_kg: float | None
    top_weight_reps: int | None
    total_sets: int
    total_reps: int


@dataclass
class ExerciseHistoryEntry:
    session_date: date_type
    reps: int | None
    weight_kg: float | None
    is_personal_record: bool


@dataclass
class ExerciseHistory:
    exercise_name: str
    entries: list[ExerciseHistoryEntry]
    weekly: tuple[ExercisePeriodStat, ExercisePeriodStat] | None
    monthly: tuple[ExercisePeriodStat, ExercisePeriodStat] | None


def _rep_based_sets_for_user(db: Session, user_id: int) -> list[tuple[WorkoutSet, date_type]]:
    """Kullanıcının TÜM tekrar-bazlı (süre-bazlı kardiyo/esneklik HARİÇ)
    setlerini, oturum tarihiyle birlikte döner - liste ekranı ve tek
    egzersiz geçmişi bu ortak sorguyu paylaşır."""
    rows = (
        db.query(WorkoutSet, WorkoutSession.session_date)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user_id, WorkoutSet.reps.isnot(None))
        .all()
    )
    return list(rows)


def list_logged_exercises(
    db: Session,
    user_id: int,
    limit: int | None = None,
    offset: int = 0,
) -> list[LoggedExercise]:
    """'Egzersizlerim' listesi - tr_lower isimle gruplanmış (aynı egzersiz
    web formundan/chat'ten farklı exercise_catalog_id alabiliyor, bkz.
    _best_before), en son antrenman tarihine göre azalan sıralı.

    limit/offset SADECE dönen dilimi kısıtlar - gruplama (set_count,
    last_logged, exercise_catalog_id) HER ZAMAN kullanıcının TÜM setleri
    üzerinden hesaplanır, sayfalamadan etkilenmez."""
    rows = _rep_based_sets_for_user(db, user_id)
    grouped: dict[str, LoggedExercise] = {}
    for workout_set, session_date in rows:
        key = tr_lower(workout_set.exercise_name_snapshot.strip())
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = LoggedExercise(
                exercise_name=workout_set.exercise_name_snapshot,
                exercise_catalog_id=workout_set.exercise_catalog_id,
                set_count=1,
                last_logged=session_date,
            )
            continue
        entry.set_count += 1
        if session_date >= entry.last_logged:
            entry.last_logged = session_date
            entry.exercise_name = workout_set.exercise_name_snapshot  # en güncel yazım gösterilir
        if workout_set.exercise_catalog_id is not None:
            entry.exercise_catalog_id = workout_set.exercise_catalog_id

    ordered = sorted(grouped.values(), key=lambda e: e.last_logged, reverse=True)
    if limit is not None:
        return ordered[offset : offset + limit]
    return ordered


def _period_bounds(d: date_type, granularity: str) -> tuple[date_type, date_type]:
    """Bir tarihin ait olduğu dönemin (ISO hafta Pzt-Paz, ya da takvim ayı)
    başlangıç/bitiş tarihlerini döner - dönem "sepetleme" anahtarı olarak
    kullanılır (calculate_weekly_streak'teki ISO hafta kuralıyla tutarlı)."""
    if granularity == "week":
        iso_year, iso_week, _ = d.isocalendar()
        start = date_type.fromisocalendar(iso_year, iso_week, 1)
        return start, start + timedelta(days=6)
    # "month"
    start = d.replace(day=1)
    next_month = start.replace(day=28) + timedelta(days=4)
    end = next_month.replace(day=1) - timedelta(days=1)
    return start, end


def _period_stat(period_start: date_type, period_end: date_type, sets: list[WorkoutSet]) -> ExercisePeriodStat:
    weighted = [s for s in sets if s.weight_kg is not None]
    if weighted:
        # En iyi set = en ağır (eşitlikte en çok tekrar) - PR mantığındaki
        # "hangi set daha iyi" tanımıyla AYNI öncelik sırası.
        best = max(weighted, key=lambda s: (s.weight_kg, s.reps or 0))
        top_weight_kg, top_weight_reps = best.weight_kg, best.reps
    else:
        top_weight_kg, top_weight_reps = None, max((s.reps for s in sets if s.reps is not None), default=None)
    return ExercisePeriodStat(
        period_start=period_start,
        period_end=period_end,
        top_weight_kg=top_weight_kg,
        top_weight_reps=top_weight_reps,
        total_sets=len(sets),
        total_reps=sum(s.reps or 0 for s in sets),
    )


def _latest_two_periods(
    rows: list[tuple[WorkoutSet, date_type]], granularity: str
) -> tuple[ExercisePeriodStat, ExercisePeriodStat] | None:
    """Verinin bulunduğu EN SON İKİ dönemi kıyaslar - katı "bu hafta vs
    geçen hafta" DEĞİL (kullanıcı bir egzersizi her hafta yapmıyor olabilir,
    o zaman sürekli "veri yok" görünürdü). Dönemler ARDIŞIK olmak zorunda
    değil, sadece kronolojik olarak en son ikisi. 2'den az farklı dönem
    varsa (hiç veya tek dönem) kıyaslama YAPILAMAZ, None döner."""
    buckets: dict[tuple[date_type, date_type], list[WorkoutSet]] = {}
    for workout_set, session_date in rows:
        bounds = _period_bounds(session_date, granularity)
        buckets.setdefault(bounds, []).append(workout_set)

    if len(buckets) < 2:
        return None

    ordered_keys = sorted(buckets.keys())
    previous_key, latest_key = ordered_keys[-2], ordered_keys[-1]
    previous_stat = _period_stat(previous_key[0], previous_key[1], buckets[previous_key])
    latest_stat = _period_stat(latest_key[0], latest_key[1], buckets[latest_key])
    return previous_stat, latest_stat


def get_exercise_history(
    db: Session, user_id: int, exercise_name: str, limit: int | None = None, offset: int = 0
) -> ExerciseHistory | None:
    """Tek bir egzersizin geçmişini + haftalık/aylık en-son-iki-dönem
    kıyaslamasını döner. Eşleşen hiç set yoksa None döner (egzersiz hiç
    loglanmamış ya da isim yanlış).

    `limit`/`offset` SADECE döndürülen `entries` ("Tüm Kayıtlar" listesi,
    kademeli yükleme - 2026-08-14 kullanıcı isteği) listesini sayfalar -
    bu ekranda backend'den önceden hiç limit/days desteği yoktu, sık
    yapılan bir egzersiz (ör. haftada 3x squat, yıllarca) için liste
    SINIRSIZ büyüyordu, en riskli noktaydı. `weekly`/`monthly` kıyaslaması
    HER ZAMAN TAM `rows` üzerinden hesaplanır - limit/offset'ten ASLA
    etkilenmez (kıyaslama kartının doğruluğu sayfalamadan bağımsız kalmalı)."""
    key = tr_lower(exercise_name.strip())
    rows = [
        (workout_set, session_date)
        for workout_set, session_date in _rep_based_sets_for_user(db, user_id)
        if tr_lower(workout_set.exercise_name_snapshot.strip()) == key
    ]
    if not rows:
        return None

    rows.sort(key=lambda r: r[1])  # ascending - weekly/monthly BUNA göre hesaplanıyor, DEĞİŞMEZ

    if limit is not None:
        # rows ascending (eskiden yeniye). "En yeni `offset` kaydı atlayıp
        # ondan önceki en fazla `limit` kaydı al" - list_workout_sessions'
        # daki DESC+limit+reversed deseninin, burada SQL değil bellek-içi
        # liste olduğu için Python-taraflı eşdeğeri.
        end = len(rows) - offset
        start = max(end - limit, 0)
        page_rows = rows[start:end] if end > 0 else []
    else:
        page_rows = rows

    entries = [
        ExerciseHistoryEntry(
            session_date=session_date,
            reps=workout_set.reps,
            weight_kg=workout_set.weight_kg,
            is_personal_record=workout_set.is_personal_record,
        )
        for workout_set, session_date in page_rows
    ]
    display_name = rows[-1][0].exercise_name_snapshot  # en güncel yazım

    return ExerciseHistory(
        exercise_name=display_name,
        entries=entries,
        weekly=_latest_two_periods(rows, "week"),
        monthly=_latest_two_periods(rows, "month"),
    )
