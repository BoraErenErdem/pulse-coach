from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.exceptions import AppValidationError
from app.models.exercise_goal import ExerciseGoal
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services import exercise_catalog_service
from app.services.fuzzy_match import tr_lower


@dataclass
class ExerciseGoalProgress:
    id: int
    exercise_name: str
    target_weight_kg: float | None
    best_weight_kg: float | None
    target_reps: int | None
    best_reps: int | None
    target_duration_minutes: float | None
    best_duration_minutes: float | None
    progress_pct: float


def find_active_goal_for_exercise(
    db: Session, user_id: int, exercise_catalog_id: int | None, exercise_name: str
) -> ExerciseGoal | None:
    """Bir kullanıcının, verilen egzersize karşılık gelen hedefini bulur -
    `_matching_sets_for_goal`/`_best_weight_for_goal` ile AYNI OR(catalog_id,
    tr_lower isim) eşleştirme ilkesi. Şemada aktif/pasif bayrağı yok - "aktif
    hedef" = "satır var" (hedefler silinene kadar kalıcı). `set_exercise_goal`'ün
    upsert-arama mantığından çıkarıldı (2026-08-12, push bildirimi hedef-
    ulaşma tespiti için de aynı arama gerekince DRY)."""
    target_name = tr_lower(exercise_name.strip())
    return next(
        (
            row
            for row in db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).all()
            if (exercise_catalog_id is not None and row.exercise_catalog_id == exercise_catalog_id)
            or tr_lower(row.exercise_name.strip()) == target_name
        ),
        None,
    )


def set_exercise_goal(
    db: Session,
    user_id: int,
    exercise_name: str,
    target_weight_kg: float | None = None,
    exercise_catalog_id: int | None = None,
    target_reps: int | None = None,
    target_duration_minutes: float | None = None,
) -> ExerciseGoal:
    """Kullanıcının bir egzersiz için hedefini kaydeder ya da günceller (aynı
    egzersiz için upsert — kullanıcı başına tek hedef). Hem Antrenman Takip
    Agent tool'u hem de POST /exercise-goals endpoint'i bu fonksiyonu çağırır.

    2026-08-27: iki KARŞILIKLI DIŞLAYICI hedef türü var - (1) ağırlık hedefi
    (`target_weight_kg`, opsiyonel `target_reps` alt-hedefiyle, ör. "60 kg ile
    8 tekrar"), (2) süre hedefi (`target_duration_minutes`, koşu bandı gibi
    kardiyo/esneklik egzersizleri için - ağırlık/tekrar kavramı yok). Bir
    çağrı ikisini BİRDEN veremez; upsert de her zaman İKİSİNİ birden yazar
    (biri None geçilirse diğer türün alanları temizlenir) - böylece bir
    egzersizin hedef türü değiştirilebilir (ör. daha önce ağırlık hedefi
    konmuş bir egzersize sonradan süre hedefi girilirse eski tekrar/ağırlık
    alanları sessizce kalıntı olarak kalmaz)."""
    if target_duration_minutes is not None:
        if target_weight_kg is not None or target_reps is not None:
            raise AppValidationError("goal_needs_weight_or_duration")
        if target_duration_minutes <= 0:
            raise AppValidationError("target_duration_must_be_positive")
    elif target_weight_kg is not None:
        if target_weight_kg <= 0:
            raise AppValidationError("target_weight_must_be_positive")
        if target_reps is not None and target_reps <= 0:
            raise AppValidationError("target_reps_must_be_positive")
    else:
        raise AppValidationError("goal_needs_weight_or_duration")

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
    existing = find_active_goal_for_exercise(db, user_id, exercise_catalog_id, exercise_name)
    if existing is not None:
        existing.target_weight_kg = target_weight_kg
        existing.target_reps = target_reps
        existing.target_duration_minutes = target_duration_minutes
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
        target_reps=target_reps,
        target_duration_minutes=target_duration_minutes,
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


def _matching_sets_for_goal(db: Session, user_id: int, goal: ExerciseGoal) -> list[WorkoutSet]:
    """workout_service.py::_best_before ile AYNI ilke: eşleşme SADECE
    exercise_catalog_id'ye göre YAPILMAZ (web/mobil formundan girilen setler
    hiç katalog eşlemesi yapmıyor olabilir), bir set YA exercise_catalog_id
    eşleşiyorsa YA DA ismi (Türkçe-doğru `tr_lower()` ile, SQLite'ın ASCII-only
    lower()'ı DEĞİL) eşleşiyorsa hedefe dahil edilir. Önceden bu filtre
    `_best_weight_for_goal` içine gömülüydü ve SADECE ağırlık alanına
    bakıyordu - tekrar/süre hedefleri de aynı eşleşen-set listesine ihtiyaç
    duyduğu için (2026-08-27) tek bir paylaşımlı sorguya çıkarıldı."""
    rows = (
        db.query(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user_id)
        .all()
    )
    target_name = tr_lower(goal.exercise_name.strip())
    return [
        row
        for row in rows
        if (goal.exercise_catalog_id is not None and row.exercise_catalog_id == goal.exercise_catalog_id)
        or tr_lower(row.exercise_name_snapshot.strip()) == target_name
    ]


def list_exercise_goal_progress(db: Session, user_id: int) -> list[ExerciseGoalProgress]:
    """Kullanıcının tüm egzersiz hedeflerini, antrenman geçmişindeki en iyi
    kayıtla karşılaştırılmış ilerleme yüzdesiyle döndürür. Hem Antrenman Takip
    Agent tool'u hem de GET /exercise-goals endpoint'i bu fonksiyonu çağırır.

    2026-08-27, hedef türüne göre iki ayrı ilerleme hesabı:
    - Süre hedefi (kardiyo/esneklik): en uzun `duration_minutes` / hedef süre.
    - Ağırlık hedefi: `best_weight_kg` (bilgi amaçlı, o egzersizde HİÇ atılmış
      en ağır kilo, tekrar sayısından bağımsız) her zaman hesaplanır. Ayrıca
      `target_reps` verilmişse, "kilo artırmak da hedefi tamamlar mı?" sorusunun
      cevabı: SADECE hedef ağırlıkta VEYA ÜSTÜNDE atılan tekrarlar sayılır -
      yani asıl `progress_pct` (ve dolayısıyla %100 tamamlanma) o TEK set
      içinde hem ağırlık HEM tekrar hedefinin birlikte karşılanmasını ister
      (ör. 70 kg'da 3 tekrar atmak, 60 kg hedefinde 8 tekrar hedefini
      TAMAMLAMAZ - 60 kg'da en az 8 tekrar gerekir). Salt ağırlığı artırmak,
      o ağırlıkta yeterli tekrar da atılmadıkça hedefi tek başına tamamlamaz."""
    goals = (
        db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).order_by(ExerciseGoal.created_at.asc()).all()
    )

    result = []
    for goal in goals:
        rows = _matching_sets_for_goal(db, user_id, goal)

        if goal.target_duration_minutes is not None:
            best_duration = max((row.duration_minutes for row in rows if row.duration_minutes is not None), default=None)
            pct = min(100.0, (best_duration / goal.target_duration_minutes) * 100) if best_duration else 0.0
            result.append(
                ExerciseGoalProgress(
                    id=goal.id,
                    exercise_name=goal.exercise_name,
                    target_weight_kg=None,
                    best_weight_kg=None,
                    target_reps=None,
                    best_reps=None,
                    target_duration_minutes=goal.target_duration_minutes,
                    best_duration_minutes=best_duration,
                    progress_pct=pct,
                )
            )
            continue

        best_weight = max((row.weight_kg for row in rows if row.weight_kg is not None), default=None)
        if goal.target_reps is not None:
            best_reps = max(
                (
                    row.reps
                    for row in rows
                    if row.weight_kg is not None and row.reps is not None and row.weight_kg >= goal.target_weight_kg
                ),
                default=None,
            )
            pct = min(100.0, (best_reps / goal.target_reps) * 100) if best_reps else 0.0
        else:
            best_reps = None
            pct = min(100.0, (best_weight / goal.target_weight_kg) * 100) if best_weight else 0.0

        result.append(
            ExerciseGoalProgress(
                id=goal.id,
                exercise_name=goal.exercise_name,
                target_weight_kg=goal.target_weight_kg,
                best_weight_kg=best_weight,
                target_reps=goal.target_reps,
                best_reps=best_reps,
                target_duration_minutes=None,
                best_duration_minutes=None,
                progress_pct=pct,
            )
        )
    return result
