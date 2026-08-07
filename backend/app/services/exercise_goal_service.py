from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.exercise_goal import ExerciseGoal
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services import exercise_catalog_service
from app.services.fuzzy_match import tr_lower


@dataclass
class ExerciseGoalProgress:
    id: int
    exercise_name: str
    target_weight_kg: float
    best_weight_kg: float | None
    progress_pct: float


def set_exercise_goal(
    db: Session,
    user_id: int,
    exercise_name: str,
    target_weight_kg: float,
    exercise_catalog_id: int | None = None,
) -> ExerciseGoal:
    """Kullanıcının bir egzersiz için ağırlık hedefini kaydeder ya da
    günceller (aynı egzersiz için upsert — kullanıcı başına tek hedef).
    Hem Antrenman Takip Agent tool'u hem de POST /exercise-goals endpoint'i
    bu fonksiyonu çağırır."""
    if target_weight_kg <= 0:
        raise ValueError("Hedef ağırlık sıfırdan büyük olmalı.")

    # REST endpoint'i (web+mobil formları) exercise_catalog_id'yi HİÇ
    # göndermiyor - sadece sohbet aracı (workout_tracking_agent.py) kendi
    # fuzzy eşleştirmesini yapıp buraya iletiyordu. Sonuç: form'dan hedef
    # eklenince exercise_catalog_id hep None kalıyor, ilerleme hesaplaması
    # (_best_weight_for_goal) SADECE ham isim metninin BİREBİR (tr_lower
    # bile değil, SQLite'ın Türkçe-güvensiz lower()'ı ile) eşleşmesine
    # dayanıyordu - hedef için seçilen katalog kaydıyla gerçek set kaydının
    # ismi ufak bir farkla (farklı varyant, sohbetten loglama vb.) bile
    # ayrılsa ilerleme sessizce %0 kalıyordu (canlı testte bulundu,
    # 2026-08-07). Fix: catalog_id verilmemişse burada da aynı fuzzy
    # eşleştirme denenir - chat aracıyla TUTARLI davranış.
    if exercise_catalog_id is None:
        match, score = exercise_catalog_service.best_match(db, exercise_name)
        if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD:
            exercise_catalog_id = match.id

    # Upsert araması da AYNI catalog_id-veya-isim ilkesiyle yapılıyor (bkz.
    # yukarıdaki fuzzy çözümleme yorumu) - artık catalog_id çözülebildiği
    # için bunu da kullanmak, ismi biraz farklı yazılmış (ör. "squat" vs
    # "Squat (Çömelme)") ama aynı egzersize karşılık gelen iki ayrı hedef
    # satırı oluşmasını önlüyor. tr_lower() SQLite'ın Türkçe-güvensiz
    # lower()'ı yerine kullanılıyor (aynı proje geneli ders).
    target_name = tr_lower(exercise_name.strip())
    existing = next(
        (
            row
            for row in db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).all()
            if (exercise_catalog_id is not None and row.exercise_catalog_id == exercise_catalog_id)
            or tr_lower(row.exercise_name.strip()) == target_name
        ),
        None,
    )
    if existing is not None:
        existing.target_weight_kg = target_weight_kg
        if exercise_catalog_id is not None:
            existing.exercise_catalog_id = exercise_catalog_id
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    goal = ExerciseGoal(
        user_id=user_id,
        exercise_name=exercise_name.strip(),
        target_weight_kg=target_weight_kg,
        exercise_catalog_id=exercise_catalog_id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def delete_exercise_goal(db: Session, user_id: int, goal_id: int) -> bool:
    """Hedefi siler. Bulunamazsa (ya da başka kullanıcıya aitse) False döner."""
    goal = db.query(ExerciseGoal).filter(ExerciseGoal.id == goal_id, ExerciseGoal.user_id == user_id).first()
    if goal is None:
        return False
    db.delete(goal)
    db.commit()
    return True


def _best_weight_for_goal(db: Session, user_id: int, goal: ExerciseGoal) -> float | None:
    """workout_service.py::_best_before ile AYNI ilke: eşleşme SADECE
    exercise_catalog_id'ye göre YAPILMAZ (web/mobil formundan girilen
    setler hiç katalog eşlemesi yapmıyor olabilir), bir set YA
    exercise_catalog_id eşleşiyorsa YA DA ismi (Türkçe-doğru `tr_lower()`
    ile, SQLite'ın ASCII-only lower()'ı DEĞİL) eşleşiyorsa hedefe dahil
    edilir. Önceden SADECE SQL'de `func.lower()` ile isim eşleştiriliyordu
    - hem Türkçe İ/I bug'ına açıktı hem de exercise_catalog_id VARSA ismi
    hiç kontrol etmiyordu (aynı egzersiz iki farklı yoldan iki farklı
    catalog_id almışsa geçmiş kopuyordu)."""
    rows = (
        db.query(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user_id, WorkoutSet.weight_kg.isnot(None))
        .all()
    )
    target_name = tr_lower(goal.exercise_name.strip())
    matching_weights = [
        row.weight_kg
        for row in rows
        if (goal.exercise_catalog_id is not None and row.exercise_catalog_id == goal.exercise_catalog_id)
        or tr_lower(row.exercise_name_snapshot.strip()) == target_name
    ]
    return max(matching_weights) if matching_weights else None


def list_exercise_goal_progress(db: Session, user_id: int) -> list[ExerciseGoalProgress]:
    """Kullanıcının tüm egzersiz hedeflerini, antrenman geçmişindeki en iyi
    (en ağır) kayıtla karşılaştırılmış ilerleme yüzdesiyle döndürür. Hem
    Antrenman Takip Agent tool'u hem de GET /exercise-goals endpoint'i bu
    fonksiyonu çağırır."""
    goals = (
        db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).order_by(ExerciseGoal.created_at.asc()).all()
    )

    result = []
    for goal in goals:
        best = _best_weight_for_goal(db, user_id, goal)
        pct = min(100.0, (best / goal.target_weight_kg) * 100) if best else 0.0
        result.append(
            ExerciseGoalProgress(
                id=goal.id,
                exercise_name=goal.exercise_name,
                target_weight_kg=goal.target_weight_kg,
                best_weight_kg=best,
                progress_pct=pct,
            )
        )
    return result
