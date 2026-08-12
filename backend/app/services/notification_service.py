import logging
from sqlalchemy.orm import Session
from app.content import notification_templates
from app.models.user import User
from app.models.workout_set import WorkoutSet
from app.services import exercise_goal_service, profile_service, push_service

logger = logging.getLogger(__name__)


def notify_set_logged(
    db: Session,
    user_id: int,
    workout_set: WorkoutSet,
    is_new_pr: bool,
    best_weight_kg_before: float | None,
) -> None:
    """workout_service.py'nin 3 set-kaydı yolunun (log_workout_session,
    log_single_set, update_workout_set) TAMAMI bu TEK helper'ı çağırır -
    PR/hedef push mantığı üç yerde ayrı ayrı tekrarlanmıyor. `is_new_pr` ve
    `best_weight_kg_before` çağıran tarafından zaten hesaplanmış olarak
    gelir (`_best_before()`/`_is_new_record()`'ın sonucu) - burada tekrar
    sorgu YAPILMAZ.

    Push hatası set kaydının kendisini ASLA bozmamalı - bu yüzden
    çağıranın try/except'ine güvenmek yerine burada da bir güvenlik ağı var."""
    try:
        user = db.get(User, user_id)
        if user is None or not user.expo_push_token:
            # Token yoksa hedef sorgusuna bile gerek yok (erken çıkış).
            return

        language = profile_service.get_language(db, user_id)
        tone = profile_service.get_coach_tone(db, user_id)
        exercise_name = workout_set.exercise_name_snapshot

        if is_new_pr:
            title, body = notification_templates.render_pr_notification(
                language, tone, exercise_name, workout_set.weight_kg
            )
            push_service.send_push_notification(
                db, user, title, body, data={"type": "pr", "screen": "workouts"}
            )

        if workout_set.weight_kg is None:
            return
        goal = exercise_goal_service.find_active_goal_for_exercise(
            db, user_id, workout_set.exercise_catalog_id, exercise_name
        )
        if goal is None:
            return
        # "Önceki en iyi < hedef <= yeni ağırlık" geçişi = bu setle hedefe
        # İLK KEZ ulaşıldı demek. best_weight_kg_before None ise (kullanıcının
        # bu egzersizde hiç geçmişi yoktu) de aynı mantık geçerli - hiçbir
        # önceki ağırlık hedefi karşılamıyordu.
        just_reached = (
            best_weight_kg_before is None or best_weight_kg_before < goal.target_weight_kg
        ) and workout_set.weight_kg >= goal.target_weight_kg
        if just_reached:
            title, body = notification_templates.render_goal_notification(
                language, tone, exercise_name, goal.target_weight_kg
            )
            push_service.send_push_notification(
                db, user, title, body, data={"type": "goal", "screen": "workouts"}
            )
    except Exception:
        logger.exception("PR/hedef bildirimi gönderilemedi (user_id=%s)", user_id)
