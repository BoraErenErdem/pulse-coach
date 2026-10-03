"""App Store incelemesi için demo hesap (2026-10-03): inceleyici giriş yapınca
boş ekranlar yerine son 14 günün dolu verisini (antrenman, öğün, kilo, ruh
hali) görür. Veri servis katmanından yazılır - normal kayıtla aynı doğrulama,
aynı türetilmiş alanlar (kalori snapshot'ı, PR, ilerleme senkronu).

Şifre git'e girmez: DEMO_ACCOUNT_PASSWORD ortam değişkeninden okunur, yoksa
rastgele üretilip bir kez ekrana yazılır (App Store Connect > App Review
Information'a o girilir). Hesap zaten varsa dokunulmaz; --reset silip yeniden
oluşturur (tarihler bugüne göre tazelenir, inceleme öncesi önerilir).

Kullanım (backend/ dizininden, DATABASE_URL hedef veritabanını gösterirken):
    python -m scripts.create_demo_account --email demo@pulsecoachapp.com --reset
"""

import argparse
import os
import secrets
from datetime import date, timedelta

from sqlalchemy.orm import Session

import app.models  # noqa: F401 - tüm modelleri kaydeder (cascade silme için)
from app.models.exercise_catalog import ExerciseCatalog
from app.models.food_catalog import FoodCatalog
from app.models.user import User
from app.services import (
    mood_service,
    nutrition_log_service,
    profile_service,
    progress_service,
    user_service,
    workout_service,
)
from app.services.user_time import user_today
from app.services.workout_service import SetInput

DEMO_TIMEZONE = "Europe/Istanbul"
HISTORY_DAYS = 14

# fdc_id -> gram; fdc_id'ler katalogda sabit (9000xxx = Türk mutfağı seed'i).
BREAKFASTS = [
    [(9000012, 100), (9000014, 50), (9000029, 70), (9000058, 100), (9000040, 20)],
    [(9000059, 250), (173944, 120), (9000061, 20)],
    [(9000094, 200), (9000029, 60), (9000091, 200)],
]
LUNCHES = [
    [(9000002, 150), (9000049, 180), (9000018, 150)],
    [(9000132, 180), (9000008, 150), (9000074, 80)],
    [(9000128, 250), (9000008, 150), (9000020, 250)],
]
DINNERS = [
    [(9000031, 300), (9000011, 150), (9000074, 100)],
    [(9000034, 150), (9000049, 150), (9000018, 150)],
    [(9000116, 250), (9000002, 120), (9000029, 50)],
]
SNACKS = [[(9000064, 160)], [(9000089, 20), (9000067, 100)], [(9000019, 150), (9000062, 15)]]

# (source_id, [(tekrar, kg), ...]) - üç günlük döngü + kardiyo; ağırlıklar haftadan
# haftaya hafifçe artar ki İlerleme grafiği ve PR rozetleri boş görünmesin.
WORKOUTS = {
    "push": [
        ("Barbell_Bench_Press_-_Medium_Grip", [(8, 60), (8, 60), (6, 65)]),
        ("Barbell_Shoulder_Press", [(10, 35), (8, 37.5)]),
    ],
    "pull": [
        ("Close-Grip_Front_Lat_Pulldown", [(10, 50), (10, 50), (8, 55)]),
        ("Barbell_Deadlift", [(5, 90), (5, 95)]),
    ],
    "legs": [
        ("Barbell_Squat", [(8, 70), (8, 75), (6, 80)]),
        ("Barbell_Hack_Squat", [(10, 60), (10, 60)]),
    ],
}
# Gün ofseti (0 = bugün) -> antrenman; bugün bilerek boş, inceleyici kaydedebilsin.
SCHEDULE = {13: "push", 11: "pull", 9: "legs", 8: "cardio", 6: "push", 4: "pull", 2: "legs", 1: "cardio"}
MOODS = ["iyi", "notr", "iyi", "harika", "dusuk", "iyi", "iyi"]


def _food_ids(db: Session) -> dict[int, int]:
    fdc_ids = {fdc for plan in (BREAKFASTS, LUNCHES, DINNERS, SNACKS) for meal in plan for fdc, _ in meal}
    rows = db.query(FoodCatalog.fdc_id, FoodCatalog.id).filter(FoodCatalog.fdc_id.in_(fdc_ids)).all()
    found = {fdc: food_id for fdc, food_id in rows}
    missing = fdc_ids - found.keys()
    if missing:
        raise SystemExit(f"Besin kataloğunda eksik fdc_id: {sorted(missing)} - katalog yüklü mü?")
    return found


def _exercise(db: Session, source_id: str, language: str) -> tuple[int, str]:
    row = db.query(ExerciseCatalog).filter(ExerciseCatalog.source_id == source_id).first()
    if row is None:
        raise SystemExit(f"Egzersiz kataloğunda yok: {source_id}")
    return row.id, row.name_en if language == "en" else row.name_tr


def _log_workout(db: Session, user_id: int, kind: str, day: date, week: int, language: str) -> None:
    if kind == "cardio":
        catalog_id, name = _exercise(db, "Running", language)
        sets = [SetInput(exercise_name=name, exercise_catalog_id=catalog_id, duration_minutes=30, intensity="orta", cardio_category="kosu")]
        workout_service.log_workout_session(db, user_id, sets, session_date=day, workout_type="kardiyo")
        return
    sets: list[SetInput] = []
    for source_id, plan in WORKOUTS[kind]:
        catalog_id, name = _exercise(db, source_id, language)
        sets += [
            SetInput(exercise_name=name, exercise_catalog_id=catalog_id, reps=reps, weight_kg=kg + 2.5 * week)
            for reps, kg in plan
        ]
    workout_service.log_workout_session(db, user_id, sets, session_date=day, workout_type="kuvvet")


def populate(db: Session, user: User, language: str) -> None:
    user.timezone = DEMO_TIMEZONE
    db.commit()
    profile_service.apply_profile_updates(
        db,
        user.id,
        {
            "display_name": "Demo",
            "goal": "weight_loss",
            "activity_level": "moderate",
            "target_weight_kg": 78.0,
            "daily_calorie_goal": 2200.0,
            "daily_protein_goal_g": 150.0,
            "daily_carbs_goal_g": 220.0,
            "daily_fat_goal_g": 70.0,
            "weekly_workout_goal_days": 4,
            "height_cm": 178.0,
            "birth_year": 1995,
            "sex": "male",
            "preferred_language": language,
        },
    )

    food_ids = _food_ids(db)
    today = user_today(db, user.id)
    for offset in range(HISTORY_DAYS, -1, -1):
        day = today - timedelta(days=offset)
        meals = [("kahvaltı", BREAKFASTS), ("öğle", LUNCHES), ("akşam", DINNERS), ("atıştırmalık", SNACKS)]
        if offset == 0:
            meals = meals[:1]  # bugün yalnız kahvaltı - gün yarım, öğün eklenebilir
        for meal_type, options in meals:
            for fdc_id, grams in options[offset % len(options)]:
                nutrition_log_service.log_meal(db, user.id, food_ids[fdc_id], grams, meal_type, day, language)

        if offset in SCHEDULE:
            _log_workout(db, user.id, SCHEDULE[offset], day, week=(HISTORY_DAYS - offset) // 7, language=language)
        if offset % 2 == 0:
            progress_service.log_progress(
                db,
                user.id,
                weight=round(82.4 - 0.11 * (HISTORY_DAYS - offset), 1),
                waist_cm=round(91.0 - 0.1 * (HISTORY_DAYS - offset), 1) if offset % 7 == 0 else None,
                log_date=day,
            )
        mood_service.log_mood(db, user.id, MOODS[offset % len(MOODS)], day)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default="demo@pulsecoachapp.com")
    parser.add_argument("--language", choices=["en", "tr"], default="en",
                        help="Profil dili ve kayıt adları; App Review inceleyicileri için varsayılan en")
    parser.add_argument("--reset", action="store_true", help="Hesap varsa silip yeniden oluştur")
    args = parser.parse_args()

    from app.db.session import SessionLocal

    email = args.email.strip().lower()
    password = os.environ.get("DEMO_ACCOUNT_PASSWORD")
    generated = password is None
    if password is None:
        password = secrets.token_urlsafe(12)

    with SessionLocal() as db:
        existing = user_service.get_by_email(db, email)
        if existing is not None:
            if not args.reset:
                raise SystemExit(f"{email} zaten var - verisini tazelemek için --reset.")
            db.delete(existing)
            db.commit()
        user = user_service.create_user(
            db, email, password, kvkk_consent=True, health_data_consent=True, terms_consent=True
        )
        populate(db, user, args.language)
        print(f"Demo hesap hazır: {email} (dil={args.language}, {HISTORY_DAYS + 1} günlük veri)")
    if generated:
        print(f"Üretilen şifre (bir kez gösterilir): {password}")


if __name__ == "__main__":
    main()
