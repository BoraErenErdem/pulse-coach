from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services.progress_service import VALID_WORKOUT_TYPES, log_progress


@dataclass
class SetInput:
    exercise_name: str
    reps: int
    weight_kg: float | None = None
    set_number: int | None = None
    exercise_catalog_id: int | None = None


@dataclass
class WorkoutSummary:
    session_count: int
    total_sets: int
    total_volume_kg: float
    sets_by_exercise: dict[str, int] = field(default_factory=dict)

    def as_text(self) -> str:
        if self.session_count == 0:
            return "Bu dönemde herhangi bir detaylı antrenman kaydı girilmemiş."

        parts = [f"Bu dönemde {self.session_count} antrenman oturumu, toplam {self.total_sets} set kaydedilmiş."]
        if self.total_volume_kg > 0:
            parts.append(f"Toplam kaldırılan ağırlık hacmi (set x tekrar x kilo): {self.total_volume_kg:.0f} kg.")
        if self.sets_by_exercise:
            top = sorted(self.sets_by_exercise.items(), key=lambda item: item[1], reverse=True)[:5]
            breakdown = ", ".join(f"{name}: {count} set" for name, count in top)
            parts.append(f"En çok çalışılan egzersizler: {breakdown}.")
        return " ".join(parts)


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
    for set_input in sets:
        key = set_input.exercise_name.strip().lower()
        set_number = set_input.set_number
        if set_number is None:
            counters[key] = counters.get(key, 0) + 1
            set_number = counters[key]

        db.add(
            WorkoutSet(
                session_id=session.id,
                exercise_catalog_id=set_input.exercise_catalog_id,
                exercise_name_snapshot=set_input.exercise_name,
                set_number=set_number,
                reps=set_input.reps,
                weight_kg=set_input.weight_kg,
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

    workout_set = WorkoutSet(
        session_id=session.id,
        exercise_catalog_id=exercise_catalog_id,
        exercise_name_snapshot=exercise_name,
        set_number=existing_count + 1,
        reps=reps,
        weight_kg=weight_kg,
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
) -> WorkoutSet | None:
    """Bir oturumdaki tek bir setin tekrar/ağırlık değerini günceller.
    Bulunamazsa None döner."""
    workout_set = _get_owned_set(db, user_id, session_id, set_id)
    if workout_set is None:
        return None
    if reps is not None:
        workout_set.reps = reps
    if weight_kg is not None:
        workout_set.weight_kg = weight_kg
    db.commit()
    db.refresh(workout_set)
    return workout_set


def generate_workout_summary(db: Session, user_id: int, days: int = 7) -> WorkoutSummary:
    """Son `days` günün antrenman özetini döndürür. Hem Antrenman Takip Agent
    tool'u hem de GET /workouts/summary endpoint'i bu fonksiyonu çağırır."""
    sessions = list_workout_sessions(db, user_id, days=days)

    total_sets = 0
    total_volume_kg = 0.0
    sets_by_exercise: dict[str, int] = {}

    for session in sessions:
        for workout_set in session.sets:
            total_sets += 1
            if workout_set.weight_kg:
                total_volume_kg += workout_set.reps * workout_set.weight_kg
            name = workout_set.exercise_name_snapshot
            sets_by_exercise[name] = sets_by_exercise.get(name, 0) + 1

    return WorkoutSummary(
        session_count=len(sessions),
        total_sets=total_sets,
        total_volume_kg=total_volume_kg,
        sets_by_exercise=sets_by_exercise,
    )
