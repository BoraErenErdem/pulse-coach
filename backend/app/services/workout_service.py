from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services import met_reference
from app.services.fuzzy_match import tr_lower
from app.services.progress_service import VALID_WORKOUT_TYPES, get_latest_weight, log_progress


@dataclass
class SetInput:
    """Bir set YA reps [+opsiyonel weight_kg] YA DA duration_minutes
    [+intensity+cardio_category] taşır (mutually exclusive, kardiyo/esneklik
    süre bazlı girişi için 2026-08-06'da eklendi - bkz. met_reference.py).
    reps None ama duration_minutes de None ise `_validate_set_input`
    ValueError fırlatır."""

    exercise_name: str
    reps: int | None = None
    weight_kg: float | None = None
    set_number: int | None = None
    exercise_catalog_id: int | None = None
    duration_minutes: float | None = None
    intensity: str | None = None
    cardio_category: str | None = None


def _validate_set_input(set_input: "SetInput") -> None:
    is_duration_based = set_input.duration_minutes is not None
    if is_duration_based:
        if set_input.intensity not in met_reference.VALID_INTENSITIES:
            raise ValueError(f"Geçersiz yoğunluk: {set_input.intensity}")
        if set_input.cardio_category not in met_reference.VALID_CARDIO_CATEGORIES:
            raise ValueError(f"Geçersiz kategori: {set_input.cardio_category}")
        if set_input.duration_minutes <= 0:
            raise ValueError("Süre sıfırdan büyük olmalı.")
    elif set_input.reps is None:
        raise ValueError("Bir set ya tekrar sayısı ya da süre (dakika) içermeli.")
    elif set_input.reps <= 0:
        raise ValueError("Tekrar sayısı sıfırdan büyük olmalı.")


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
) -> tuple[float | None, int | None]:
    """Kullanıcının bir egzersizdeki önceki en iyi ağırlıklı ve vücut
    ağırlığıyla (weight_kg boş) kaydını döner: (en_agir_kg, en_cok_tekrar).
    Kişisel rekor tespitinde hem `log_single_set`/`log_workout_session`
    (yeni set eklerken) hem `update_workout_set` (mevcut bir seti
    düzenlerken, kendisi hariç) bu fonksiyonu kullanır.

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
    return best_weight_kg, best_bodyweight_reps


def _is_new_record(
    reps: int | None,
    weight_kg: float | None,
    best_weight_kg: float | None,
    best_bodyweight_reps: int | None,
) -> bool:
    """Ağırlıklı bir set için önceki en ağır kayıttan DAHA AĞIR mı, vücut
    ağırlığı seti (weight_kg yok) için önceki en çok tekrardan DAHA FAZLA
    tekrar mı diye bakar. Egzersizin hiç önceki kaydı yoksa (ilk kez
    yapılıyorsa) kasıtlı olarak rekor SAYILMAZ — kıyaslanacak bir temel
    olmadan "rekor kırıldı" demek yanıltıcı olur.

    Süre bazlı (reps=None) setler için PR kavramı bu turda kapsam dışı -
    her zaman False döner (ör. "en uzun süre" PR'ı sonraki bir iyileştirme)."""
    if reps is None:
        return False
    if weight_kg is not None:
        return best_weight_kg is not None and weight_kg > best_weight_kg
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
        raise ValueError(f"Geçersiz antrenman türü: {workout_type}")
    if not sets:
        raise ValueError("En az bir set girilmeli.")

    resolved_date = session_date or datetime.now(timezone.utc).date()

    session = WorkoutSession(user_id=user_id, session_date=resolved_date, workout_type=workout_type, note=note)
    db.add(session)
    db.flush()  # session.id gerekiyor

    counters: dict[str, int] = {}
    # Ayni istekte (bulk) ayni egzersizin birden fazla seti gelebilir; bu
    # yuzden her setten sonra en iyisini bellekte guncelleyip bir sonraki
    # sete o guncel degerle kiyaslamak gerekiyor (DB henuz commit edilmedi).
    running_best: dict[str, tuple[float | None, int | None]] = {}
    for set_input in sets:
        _validate_set_input(set_input)
        key = set_input.exercise_name.strip().lower()
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
            cache_key = tr_lower(key)
            if cache_key not in running_best:
                running_best[cache_key] = _best_before(
                    db, user_id, set_input.exercise_catalog_id, set_input.exercise_name
                )
            best_weight_kg, best_bodyweight_reps = running_best[cache_key]

            is_pr = _is_new_record(set_input.reps, set_input.weight_kg, best_weight_kg, best_bodyweight_reps)
            # Rekor olarak İŞARETLENMESE bile (ör. bu egzersizin ilk seti,
            # kıyaslanacak bir temel yok), bu set aynı istekteki SONRAKİ
            # setler için artık bilinen en iyi değer haline gelir.
            if set_input.weight_kg is not None:
                new_best_weight = (
                    set_input.weight_kg if best_weight_kg is None else max(best_weight_kg, set_input.weight_kg)
                )
                running_best[cache_key] = (new_best_weight, best_bodyweight_reps)
            else:
                new_best_reps = (
                    set_input.reps if best_bodyweight_reps is None else max(best_bodyweight_reps, set_input.reps)
                )
                running_best[cache_key] = (best_weight_kg, new_best_reps)

        db.add(
            WorkoutSet(
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
        )

    db.commit()
    db.refresh(session)

    log_progress(
        db,
        user_id,
        workout_completed=True,
        workout_type=workout_type,
        log_date=resolved_date,
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
        raise ValueError(f"Geçersiz antrenman türü: {workout_type}")

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

    key = exercise_name.strip().lower()
    existing_count = sum(1 for s in session.sets if s.exercise_name_snapshot.strip().lower() == key)

    best_weight_kg, best_bodyweight_reps = _best_before(db, user_id, exercise_catalog_id, exercise_name)
    is_pr = _is_new_record(reps, weight_kg, best_weight_kg, best_bodyweight_reps)

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

    return workout_set


def list_workout_sessions(
    db: Session, user_id: int, days: int | None = None, limit: int | None = None
) -> list[WorkoutSession]:
    """Kullanıcının antrenman oturumlarını (set'leriyle birlikte) tarih
    sırasıyla döndürür. `days` verilirse sadece son o kadar günü, `limit`
    verilirse en fazla o kadar (en yeni) oturumu döndürür."""
    query = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(WorkoutSession.session_date >= since)
    if limit is not None:
        # en yeni N kayıt isteniyor - tarihe göre TERSTEN al, sonra tekrar
        # eskiden-yeniye çevir (frontend'in beklediği sıralama bozulmasın diye)
        rows = query.order_by(WorkoutSession.session_date.desc()).limit(limit).all()
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
            raise ValueError(f"Geçersiz antrenman türü: {workout_type}")
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
        best_weight_kg, best_bodyweight_reps = _best_before(
            db,
            user_id,
            workout_set.exercise_catalog_id,
            workout_set.exercise_name_snapshot,
            exclude_set_id=workout_set.id,
        )
        workout_set.is_personal_record = _is_new_record(
            workout_set.reps, workout_set.weight_kg, best_weight_kg, best_bodyweight_reps
        )

    db.commit()
    db.refresh(workout_set)
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

    return WorkoutSummary(
        session_count=len(sessions),
        total_sets=total_sets,
        total_volume_kg=total_volume_kg,
        sets_by_exercise=sets_by_exercise,
        days=days,
        total_calories_burned=total_calories_burned,
    )
