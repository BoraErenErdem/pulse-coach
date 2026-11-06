"""Tanıtım (vitrin) hesabı (2026-11-06): uygulamayı insanlara göstermek ve reklam videosu
çekmek için, App Store inceleme demo hesabından (create_demo_account.py) AYRI bir hesap.
Tüm özellikler dolu görünür: 30 günlük öğün/antrenman/kilo/bel/yağ/ruh hali, Apple Sağlık
adımları (rızalı), egzersiz ve vücut hedefleri, haftalık hedef, örnek koç sohbeti ve haftalık
koç mesajı. Bugün yarım gün: kahvaltı + öğle + sabah antrenmanı kayıtlı, akşam eklenebilir.

Oluşturma (şifre git'e/belleğe girmez, ortam değişkeninden):
    SHOWCASE_PASSWORD=... python -m scripts.showcase_account --create
Tazeleme (her gün; şifreye ve açık oturumlara DOKUNMAZ, yalnız veriyi bugüne göre kurar):
    python -m scripts.showcase_account --refresh
"""

import argparse
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

import app.models  # noqa: F401 - tüm modelleri kaydeder
from app.models.checkin_message import CheckinMessage
from app.models.conversation import Conversation
from app.models.daily_steps import DailySteps
from app.models.exercise_goal import ExerciseGoal
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.services import (
    exercise_goal_service,
    mood_service,
    nutrition_log_service,
    profile_service,
    progress_service,
    step_service,
    user_service,
)
from app.services.user_time import user_today
from scripts.create_demo_account import BREAKFASTS, DINNERS, LUNCHES, SNACKS, _exercise, _food_ids, _log_workout

SHOWCASE_EMAIL = "tanitim@pulsecoachapp.com"
TIMEZONE = "Europe/Istanbul"
DAYS = 30  # bugün hariç; adım eşitlemesi en fazla 31 gün

# Haftada 5 gün (hedef 4 -> hafta tamamlanmış görünür), bugün 3 günlük seri; aralarda dinlenme.
# 0 = bugün (sabah bacak antrenmanı).
PATTERN = ["legs", "cardio", "push", None, "pull", "cardio", None]
MOODS = ["iyi", "harika", "iyi", "notr", "iyi", "harika", "dusuk", "iyi", "iyi", "notr"]
STEPS = [7820, 11240, 9480, 6230, 12950, 10310, 4870, 8940, 13420, 9760, 7150, 10890, 5640, 11780, 9210]

CHAT = [
    (
        "Bu hafta nasıl gidiyorum?",
        "Güzel gidiyorsun! Bu hafta antrenmanlarını düzenli yaptın ve haftalık hedefine çok yakınsın. "
        "Kilon son haftalarda yavaş ama istikrarlı düşüyor, bel ölçün de onunla birlikte iniyor; bu, yağ "
        "kaybettiğini gösteren iyi bir işaret. Protein hedefine çoğu gün ulaşıyorsun, akşam öğünlerinde biraz "
        "daha sebze eklemek iyi gelebilir. Bu tempoyu korumaya devam! 💪",
    ),
    (
        "Antrenmandan sonra ne yemeliyim?",
        "Antrenmandan sonraki 1-2 saat içinde protein ve karbonhidratı birlikte almak toparlanmana yardımcı "
        "olur. Örneğin ızgara tavuk ve bulgur pilavı, ya da yoğurt, yulaf ve muz iyi seçenekler. Hedefin kilo "
        "vermek olduğu için porsiyonu günlük kalori hedefine göre ayarlaman yeterli. Su içmeyi de unutma!",
    ),
]
WEEKLY_REVIEW = (
    "Haftalık değerlendirmen hazır: Bu hafta 4 gün antrenman yaptın ve haftalık hedefini tamamladın 🎉 "
    "Kilon geçen haftaya göre biraz düştü, ruh halin de çoğu gün iyiydi. Önümüzdeki hafta bacak "
    "antrenmanında squat ağırlığını küçük bir adımla artırmayı deneyebilirsin."
)


def _clear_data(db: Session, user_id: int) -> None:
    """Hesabın tüm kayıtlarını siler; kullanıcı satırı, şifre ve oturum jetonları kalır."""
    for model in (WorkoutSession, MealEntry, ProgressLog, MoodLog, ExerciseGoal, Conversation, CheckinMessage, DailySteps):
        for row in db.query(model).filter(model.user_id == user_id).all():
            db.delete(row)  # ORM ile: set'ler gibi alt kayıtlar da cascade silinir
    user = db.get(User, user_id)
    assert user is not None
    user.chat_cleared_at = None
    db.commit()


def populate(db: Session, user: User) -> None:
    user.timezone = TIMEZONE
    db.commit()
    profile_service.apply_profile_updates(
        db,
        user.id,
        {
            "display_name": "Deniz",
            "goal": "weight_loss",
            "activity_level": "moderate",
            "target_weight_kg": 77.0,
            "target_waist_cm": 85.0,
            "target_body_fat_pct": 18.0,
            "daily_calorie_goal": 1950.0,  # örnek öğünler 1.636-1.806 kcal: seri (%80-120) dolsun
            "daily_protein_goal_g": 150.0,
            "daily_carbs_goal_g": 190.0,
            "daily_fat_goal_g": 65.0,
            "weekly_workout_goal_days": 4,
            "height_cm": 178.0,
            "birth_year": 1995,
            "sex": "male",
            "preferred_language": "tr",
            "coach_tone": "sicak",
        },
    )

    food_ids = _food_ids(db)
    today = user_today(db, user.id)
    for offset in range(DAYS, -1, -1):
        day = today - timedelta(days=offset)
        meals = [("kahvaltı", BREAKFASTS), ("öğle", LUNCHES), ("akşam", DINNERS), ("atıştırmalık", SNACKS)]
        if offset == 0:
            meals = meals[:2]  # bugün: kahvaltı + öğle, akşam videoda eklenebilir
        for meal_type, options in meals:
            for fdc_id, grams in options[offset % len(options)]:
                nutrition_log_service.log_meal(db, user.id, food_ids[fdc_id], grams, meal_type, day, "tr")

        kind = PATTERN[offset % len(PATTERN)]
        if kind is not None:
            _log_workout(db, user.id, kind, day, week=(DAYS - offset) // 7, language="tr")

        progressed = DAYS - offset
        if offset % 2 == 0:
            weekly = offset % 7 == 0
            progress_service.log_progress(
                db,
                user.id,
                weight=round(84.2 - 0.11 * progressed, 1),
                waist_cm=round(93.0 - 0.12 * progressed, 1) if weekly else None,
                body_fat_pct=round(23.5 - 0.06 * progressed, 1) if weekly else None,
                log_date=day,
            )
        mood_service.log_mood(db, user.id, MOODS[offset % len(MOODS)], day)

    # Apple Sağlık adımları (ayrı rıza dahil, gerçek akıştaki gibi).
    step_service.give_steps_consent(db, user.id)
    step_service.sync_steps(
        db, user.id, [(today - timedelta(days=o), STEPS[o % len(STEPS)]) for o in range(DAYS, -1, -1)]
    )

    # Hedefler: bench ulaşılmış, squat yolda (ilerleme çubuğu), koşu süre hedefi.
    for source_id, kg, reps, minutes in (
        ("Barbell_Bench_Press_-_Medium_Grip", 75.0, 6, None),  # ulaşılmış (rozet)
        ("Barbell_Squat", 100.0, 5, None),
        ("Running", None, None, 40.0),
    ):
        catalog_id, name = _exercise(db, source_id, "tr")
        exercise_goal_service.set_exercise_goal(
            db, user.id, name, target_weight_kg=kg, exercise_catalog_id=catalog_id,
            target_reps=reps, target_duration_minutes=minutes,
        )

    # Örnek koç sohbeti ve okunmamış haftalık değerlendirme (bildirimler ekranı).
    now = datetime.now(timezone.utc)
    for i, (question, answer) in enumerate(CHAT):
        at = now - timedelta(hours=3 - i)
        db.add(Conversation(user_id=user.id, role="user", content=question, timestamp=at))
        db.add(Conversation(user_id=user.id, role="assistant", content=answer, agent_used="tracking_agent",
                            timestamp=at + timedelta(seconds=5)))
    db.add(CheckinMessage(user_id=user.id, kind="weekly_summary", message=WEEKLY_REVIEW,
                          generated_at=now - timedelta(days=(today.weekday() + 1) % 7 or 7)))
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--create", action="store_true", help="Hesabı oluştur (SHOWCASE_PASSWORD gerekir)")
    mode.add_argument("--refresh", action="store_true", help="Veriyi bugüne göre yeniden kur (şifre değişmez)")
    args = parser.parse_args()

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        user = user_service.get_by_email(db, SHOWCASE_EMAIL)
        if args.create:
            if user is not None:
                raise SystemExit(f"{SHOWCASE_EMAIL} zaten var - verisini tazelemek için --refresh.")
            password = os.environ.get("SHOWCASE_PASSWORD")
            if not password:
                raise SystemExit("SHOWCASE_PASSWORD ortam değişkeni gerekli.")
            user = user_service.create_user(
                db, SHOWCASE_EMAIL, password, kvkk_consent=True, health_data_consent=True, terms_consent=True
            )
        else:
            if user is None:
                raise SystemExit(f"{SHOWCASE_EMAIL} yok - önce --create.")
            _clear_data(db, user.id)
        populate(db, user)
        print(f"Tanıtım hesabı hazır: {SHOWCASE_EMAIL} ({DAYS + 1} günlük veri, {datetime.now():%Y-%m-%d %H:%M})")


if __name__ == "__main__":
    main()
