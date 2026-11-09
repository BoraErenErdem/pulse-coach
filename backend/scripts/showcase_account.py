"""Tanıtım (vitrin) hesabı (2026-11-06, 2026-11-09 genişletildi): uygulamayı insanlara göstermek
ve reklam videosu çekmek için, App Store inceleme demo hesabından (create_demo_account.py) AYRI
bir hesap. ~3 aydır düzenli kullanılan bir hesap gibi görünür, ama kusursuz değil:

- 12 haftalık geçmiş: haftada 5 antrenman (üst A / koşu / alt B / üst B / alt A, arada iki
  dinlenme günü), kademeli ağırlık artışı, birkaç atlanan antrenman.
- Her gün Türk mutfağından değişen öğünler (aynı tarih her tazelemede aynı menüyü alır);
  kalori hedefin %80-120'sinde tutulur, bilinçli üç istisna dışında.
- Seri bilerek üç kez kırılır (bir gün ruh hali unutulmuş, bir akşam dışarıda yemek, bir gün
  akşam yemeği girilmemiş): güncel seri 22 gün, en uzun 26 gün -> "30 gün seri" rozeti yolda.
- Haftada üç tartı, haftalık bel/yağ ölçümü; ruh hali çoğu gün iyi, arada düşük günler.
- Apple Sağlık adımları (rızalı, son 31 gün - telefonun ilk eşitleme sınırı).
- 4 egzersiz hedefi (bench ulaşıldı, squat/deadlift/koşu yolda), 11 koç sohbeti (sayılar
  kurulan veriden hesaplanır), 4 haftalık değerlendirme + 1 hatırlatma bildirimi.
- Bugün yarım gün: kahvaltı + öğle + sabah bacak antrenmanı (squat rekoru), akşam eklenebilir.

Oluşturma (şifre git'e/belleğe girmez, ortam değişkeninden):
    SHOWCASE_PASSWORD=... python -m scripts.showcase_account --create
Tazeleme (her gün; şifreye ve açık oturumlara DOKUNMAZ, yalnız veriyi bugüne göre kurar):
    python -m scripts.showcase_account --refresh
"""

import argparse
import math
import os
import random
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

import app.models  # noqa: F401 - tüm modelleri kaydeder
from app.models.checkin_message import CheckinMessage
from app.models.conversation import Conversation
from app.models.daily_steps import DailySteps
from app.models.exercise_goal import ExerciseGoal
from app.models.food_catalog import FoodCatalog
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
    workout_service,
)
from app.services.limits import MAX_STEP_SYNC_DAYS
from app.services.user_time import user_today
from app.services.workout_service import SetInput
from scripts.create_demo_account import _exercise

SHOWCASE_EMAIL = "tanitim@pulsecoachapp.com"
TIMEZONE = "Europe/Istanbul"
TZ = ZoneInfo(TIMEZONE)
DAYS = 84  # bugün hariç, 12 hafta
CALORIE_GOAL = 1950.0
HEIGHT_CM = 178.0

# --- Beslenme: (fdc_id, gram); 9000xxx = Türk mutfağı seed'i, 173944 = muz ----------------
BREAKFASTS = [
    [(9000012, 100), (9000014, 40), (9000029, 60), (9000058, 100), (9000040, 20)],  # yumurta, peynir
    [(9000059, 250), (173944, 120), (9000061, 20)],  # yulaf, muz, badem
    [(9000094, 200), (9000029, 60), (9000091, 200)],  # menemen
    [(9000019, 200), (9000178, 40), (9000066, 100)],  # süzme yoğurt, granola, çilek
    [(9000096, 150), (9000029, 40), (9000058, 100)],  # peynirli omlet
    [(9000016, 100), (9000012, 100), (9000029, 60), (9000058, 100), (9000062, 10)],  # lor, yumurta
]
WEEKEND_BREAKFAST = [(9000095, 150), (9000029, 60), (9000058, 100), (9000040, 20), (9000091, 200)]
LUNCHES = [
    [(9000002, 150), (9000049, 180), (9000018, 150)],  # ızgara tavuk, bulgur, yoğurt
    [(9000132, 180), (9000008, 150), (9000074, 80)],  # tavuk şiş, pilav
    [(9000128, 250), (9000008, 150), (9000020, 250)],  # nohut, pilav, ayran
    [(9000031, 300), (9000137, 200)],  # mercimek çorbası, tavuk dürüm
    [(9000009, 120), (9000156, 200), (9000029, 60), (9000018, 150)],  # ton balıklı salata
    [(9000127, 250), (9000049, 150), (9000157, 150)],  # kuru fasulye, bulgur, cacık
    [(9000034, 150), (9000161, 150), (9000020, 250)],  # ızgara köfte, piyaz, ayran
]
DINNERS = [
    [(9000011, 150), (9000049, 150), (9000156, 150)],  # somon, bulgur, salata
    [(9000034, 150), (9000049, 150), (9000157, 150), (9000074, 80)],  # köfte, bulgur, cacık
    [(9000116, 250), (9000002, 120), (9000018, 150), (9000029, 40)],  # taze fasulye, tavuk
    [(9000081, 250), (9000156, 200), (9000029, 50)],  # levrek, salata
    [(9000031, 300), (9000131, 250), (9000008, 100)],  # mercimek çorbası, tavuk sote
    [(9000117, 300), (9000008, 150), (9000157, 150)],  # etli taze fasulye, pilav, cacık
    [(9000078, 150), (9000047, 150), (9000156, 150)],  # hindi göğsü, makarna
]
SNACKS = [
    [(9000064, 160), (9000089, 20)],  # elma, ceviz
    [(9000019, 150), (9000062, 10)],  # süzme yoğurt, bal
    [(173944, 120), (9000061, 20)],  # muz, badem
    [(9000175, 40), (9000070, 150)],  # leblebi, portakal
    [(9000092, 250), (9000071, 150), (9000022, 15)],  # filtre kahve, armut, fındık
]
WEEKEND_TREATS = [[(9000053, 60), (9000093, 60)], [(9000162, 200)]]  # baklava + kahve, sütlaç
DINNER_OUT = [(9000033, 200), (9000110, 80), (9000159, 80), (9000020, 250), (9000038, 150)]  # adana, künefe
EXTRA_TREAT = [(9000053, 60)]

# Sohbette anlatılan öğünler o gün gerçekten kayıtlı olsun.
FORCED_MEALS = {
    (26, "öğle"): LUNCHES[0],
    (8, "akşam"): DINNERS[3],
    (2, "kahvaltı"): BREAKFASTS[0],
}
# Serinin bilinçli kırıldığı günler (bkz. modül açıklaması).
MOOD_FORGOTTEN = 23
DINNER_OUT_DAY = 50
DINNER_FORGOTTEN = 76

# --- Antrenman: (source_id, [(tekrar, ağırlık farkı)], başlangıç kg, artış, kaç haftada bir) ---
# Başlangıç kg None = vücut ağırlığı; o zaman artış "tekrar artışı"dır.
UPPER_A = [
    ("Barbell_Bench_Press_-_Medium_Grip", [(8, 0), (8, 0), (7, 0), (6, 0)], 65.0, 2.5, 2.5),
    ("Bent_Over_Barbell_Row", [(10, 0)] * 3, 50.0, 2.5, 3),
    ("Barbell_Shoulder_Press", [(8, 0)] * 3, 32.5, 2.5, 4),
    ("Triceps_Pushdown", [(12, 0)] * 3, 20.0, 2.5, 4),
    ("Dumbbell_Bicep_Curl", [(12, 0), (12, 0), (10, 0)], 10.0, 2.0, 4),
]
UPPER_B = [
    ("Incline_Dumbbell_Press", [(10, 0), (10, 0), (8, 0)], 20.0, 2.0, 3),
    ("Pullups", [(6, 0), (6, 0), (5, 0)], None, 1, 4),
    ("Seated_Cable_Rows", [(12, 0)] * 3, 45.0, 2.5, 2.5),
    ("Side_Lateral_Raise", [(15, 0)] * 3, 7.0, 1.0, 4),
    ("Hammer_Curls", [(10, 0)] * 3, 12.0, 2.0, 5),
]
LOWER_A = [
    ("Barbell_Squat", [(5, 0)] * 4, 80.0, 2.5, 2),
    ("Romanian_Deadlift", [(8, 0)] * 3, 60.0, 2.5, 2.5),
    ("Leg_Press", [(12, 0)] * 3, 120.0, 10.0, 3),
    ("Standing_Calf_Raises", [(15, 0)] * 3, 40.0, 5.0, 3),
]
LOWER_B = [
    ("Barbell_Deadlift", [(5, 0)] * 3, 100.0, 2.5, 1.5),
    ("Dumbbell_Lunges", [(10, 0)] * 3, 14.0, 2.0, 4),
    ("Lying_Leg_Curls", [(12, 0)] * 3, 35.0, 2.5, 3),
    ("Hanging_Leg_Raise", [(12, 0), (12, 0), (10, 0)], None, 0, 4),
]
STRENGTH = {"upper_a": UPPER_A, "upper_b": UPPER_B, "lower_a": LOWER_A, "lower_b": LOWER_B}
# offset % 7 -> gün; kronolojik: üst A, koşu, alt B, dinlenme, üst B, dinlenme, alt A (bugün).
PATTERN = {6: "upper_a", 5: "run", 4: "lower_b", 3: None, 2: "upper_b", 1: None, 0: "lower_a"}
SKIPPED_WORKOUTS = {16, 33, 46, 61, 72}  # 16: yorgun gün (sohbette konuşuluyor)
WORKOUT_NOTES = {
    0: "Squat'ta yeni rekor, derinlik iyiydi.",
    13: "Bench 75 kg x 6 - hedef tamam!",
    26: "Sahil yolunda koştum, hava çok güzeldi.",
    53: "Deadlift'te kalçayı daha iyi kilitledim.",
}

MOOD_CYCLE = ["iyi", "harika", "iyi", "notr", "iyi", "iyi", "harika", "notr", "iyi", "iyi", "harika"]
MOOD_OVERRIDES = {0: "iyi", 13: "harika", 16: "dusuk", 41: "dusuk", 50: "harika", 52: "zor", 66: "dusuk"}

# Sohbet: (gün ofseti, yerel saat, ajan, kullanıcı mesajı, yanıt fonksiyonu adı)
Facts = dict[str, float]


def _week(offset: int) -> float:
    return (DAYS - offset) / 7


def lift_kg(base: float, inc: float, period: float, offset: int) -> float:
    return base + inc * math.floor(_week(offset) / period)


def run_minutes(offset: int) -> int:
    return round(25 + 1.0 * _week(offset))


def body_weight(day: date, offset: int) -> float:
    noise = ((day.toordinal() * 37) % 7 - 3) * 0.1  # +-0.3 kg günlük dalgalanma
    return round(86.6 - 0.5 * _week(offset) + noise, 1)


def daily_steps(day: date, offset: int) -> int:
    if offset == 0:
        return 6240  # gün yarım
    noise = (day.toordinal() * 7919) % 2400 - 1200
    if offset % 7 == 5:
        return 13200 + noise  # koşu günü
    if offset % 7 == 3:
        return 7600 + noise  # dinlenme, akşam yürüyüşü
    if offset % 7 == 1:
        return 5800 + noise  # dinlenme
    return 9200 + noise


def _fmt(value: float) -> str:
    """Türkçe ondalık: 80.6 -> '80,6', 95.0 -> '95'."""
    return f"{value:.1f}".removesuffix(".0").replace(".", ",")


def _int(value: float) -> str:
    return f"{round(value):,}".replace(",", ".")


def _clear_data(db: Session, user_id: int) -> None:
    """Hesabın tüm kayıtlarını siler; kullanıcı satırı, şifre ve oturum jetonları kalır."""
    for model in (WorkoutSession, MealEntry, ProgressLog, MoodLog, ExerciseGoal, Conversation, CheckinMessage, DailySteps):
        for row in db.query(model).filter(model.user_id == user_id).all():
            db.delete(row)  # ORM ile: set'ler gibi alt kayıtlar da cascade silinir
    user = db.get(User, user_id)
    assert user is not None
    user.chat_cleared_at = None
    db.commit()


def _catalog(db: Session) -> dict[int, FoodCatalog]:
    plans = BREAKFASTS + LUNCHES + DINNERS + SNACKS + WEEKEND_TREATS + [WEEKEND_BREAKFAST, DINNER_OUT, EXTRA_TREAT]
    fdc_ids = {fdc for meal in plans for fdc, _ in meal}
    rows = db.query(FoodCatalog).filter(FoodCatalog.fdc_id.in_(fdc_ids)).all()
    found = {row.fdc_id: row for row in rows}
    missing = fdc_ids - found.keys()
    if missing:
        raise SystemExit(f"Besin kataloğunda eksik fdc_id: {sorted(missing)} - katalog yüklü mü?")
    return found


def _totals(catalog: dict[int, FoodCatalog], items: list[tuple[int, int]]) -> tuple[float, float]:
    kcal = sum((catalog[f].calories_kcal or 0) * g / 100 for f, g in items)
    protein = sum((catalog[f].protein_g or 0) * g / 100 for f, g in items)
    return kcal, protein


def plan_day(catalog: dict[int, FoodCatalog], day: date, offset: int) -> list[tuple[str, list[tuple[int, int]]]]:
    """Günün öğünleri. Aynı tarih her tazelemede aynı menüyü alır (tarih tohumlu)."""
    rng = random.Random(day.toordinal())
    weekend = day.weekday() >= 5
    breakfast = WEEKEND_BREAKFAST if weekend and rng.random() < 0.5 else rng.choice(BREAKFASTS)
    meals: list[tuple[str, list[tuple[int, int]]]] = [
        ("kahvaltı", breakfast),
        ("öğle", rng.choice(LUNCHES)),
        ("akşam", rng.choice(DINNERS)),
    ]
    if rng.random() < 0.8:
        snack = rng.choice(WEEKEND_TREATS) if weekend and rng.random() < 0.5 else rng.choice(SNACKS)
        meals.append(("atıştırmalık", snack))
    meals = [(mt, FORCED_MEALS.get((offset, mt), items)) for mt, items in meals]

    if offset == 0:
        return meals[:2]  # bugün: kahvaltı + öğle, akşam videoda eklenebilir
    if offset == DINNER_FORGOTTEN:
        return meals[:2]  # akşam yemeği girilmemiş -> hedefin altında, seri kırılır
    if offset == DINNER_OUT_DAY:
        meals = [m for m in meals if m[0] != "akşam"] + [("akşam", DINNER_OUT)]
        while sum(_totals(catalog, items)[0] for _, items in meals) <= CALORIE_GOAL * 1.25:
            meals.append(("atıştırmalık", EXTRA_TREAT))
        return meals

    # Normal gün: seri kırılmasın diye hedefin %82-115'inde tut.
    def total() -> float:
        return sum(_totals(catalog, items)[0] for _, items in meals)

    snack_i = 0
    while total() < CALORIE_GOAL * 0.82:
        meals.append(("atıştırmalık", SNACKS[snack_i % len(SNACKS)]))
        snack_i += 1
    while total() > CALORIE_GOAL * 1.15 and meals[-1][0] == "atıştırmalık":
        meals.pop()
    return meals


def _log_strength(db: Session, kind: str, offset: int) -> tuple[list[SetInput], dict[str, float]]:
    sets: list[SetInput] = []
    top: dict[str, float] = {}
    for source_id, plan, base, inc, period in STRENGTH[kind]:
        catalog_id, name = _exercise(db, source_id, "tr")
        for reps, delta in plan:
            if base is None:  # vücut ağırlığı: tekrar artar
                reps = reps + int(inc * math.floor(_week(offset) / period))
                sets.append(SetInput(exercise_name=name, exercise_catalog_id=catalog_id, reps=reps))
            else:
                kg = lift_kg(base, inc, period, offset) + delta
                sets.append(SetInput(exercise_name=name, exercise_catalog_id=catalog_id, reps=reps, weight_kg=kg))
                top[source_id] = max(top.get(source_id, 0.0), kg)
    return sets, top


def _log_workout(db: Session, user_id: int, kind: str, day: date, offset: int) -> float | None:
    """Antrenmanı kaydeder; kardiyoda tahmini kaloriyi döndürür."""
    note = WORKOUT_NOTES.get(offset)
    if kind in STRENGTH:
        sets, _ = _log_strength(db, kind, offset)
        workout_service.log_workout_session(db, user_id, sets, session_date=day, workout_type="kuvvet", note=note)
        return None
    catalog_id, name = _exercise(db, "Running", "tr")
    session = workout_service.log_workout_session(
        db, user_id,
        [SetInput(exercise_name=name, exercise_catalog_id=catalog_id, duration_minutes=run_minutes(offset),
                  intensity="orta", cardio_category="kosu")],
        session_date=day, workout_type="kardiyo", note=note,
    )
    return session.sets[0].estimated_calories if session.sets else None


def _workout_kind(offset: int) -> str | None:
    return None if offset in SKIPPED_WORKOUTS else PATTERN[offset % 7]


def _local(day: date, hhmm: str) -> datetime:
    hour, minute = map(int, hhmm.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=TZ).astimezone(timezone.utc)


def _chat(facts: Facts) -> list[tuple[int, str, str, str, str]]:
    f = facts
    return [
        (33, "20:40", "nutrition_agent",
         "Kilo vermek istiyorum ama kas kaybetmekten korkuyorum. Nasıl bir yol izlemeliyim?",
         "Çok yerinde bir soru! Kas kaybını en aza indirmenin üç temel ayağı var:\n\n"
         "1. **Ilımlı kalori açığı:** Günlük 1.950 kcal hedefin, haftada yaklaşık 0,5 kg vermene göre ayarlı. "
         "Daha sert bir açık, kaybın daha büyük kısmının kastan gelmesine yol açabilir.\n"
         "2. **Yeterli protein:** Hedefin günde 150 g. Her öğüne bir protein kaynağı (yumurta, tavuk, "
         "balık, yoğurt, baklagil) eklemek bunu kolaylaştırır.\n"
         "3. **Ağırlık antrenmanına devam:** Kasın 'hâlâ lazımım' sinyalini alması için ağırlıkları "
         "korumaya, mümkünse yavaşça artırmaya çalış.\n\n"
         "Bir de uykunu ihmal etme; toparlanma ve iştah kontrolü için çok önemli. 💪"),
        (26, "13:10", "nutrition_tracking_agent",
         "Öğlen 150 gram ızgara tavuk, 180 gram bulgur pilavı ve bir kase yoğurt (150 g) yedim",
         f"Afiyet olsun! Öğle öğününe 3 kalem ekledim:\n\n"
         f"- Tavuk göğsü, ızgara - 150 g\n- Bulgur pilavı - 180 g\n- Yoğurt - 150 g\n\n"
         f"Toplam yaklaşık **{_int(f['lunch26_kcal'])} kcal** ve **{_int(f['lunch26_protein'])} g protein**. "
         f"Protein açısından çok iyi bir öğün oldu, akşam için de benzer bir denge yakalarsan hedefine rahat ulaşırsın."),
        (19, "21:05", "exercise_agent",
         f"Bench press'te {_fmt(f['bench_stuck'])} kg'da takıldım, iki haftadır artıramıyorum. Ne yapabilirim?",
         "Kalori açığındayken kuvvet artışının yavaşlaması çok normal, bu bir geri gidiş değil. Birkaç öneri:\n\n"
         "- **Küçük adımlar:** 2,5 kg yerine önce tekrarları artır (ör. 4x6'dan 4x8'e), sonra ağırlığa geç.\n"
         "- **Dinlenme süresi:** Ağır setler arasında 2-3 dakika dinlen.\n"
         "- **Yardımcı hareketler:** Triceps ve omuz çalışması bench'i destekler, programında zaten var.\n"
         "- **Toparlanma:** Uyku ve protein, açıktayken her zamankinden daha önemli.\n\n"
         "Birkaç hafta içinde 75 kg'ı görmen çok olası, hedefin de zaten orada. 🎯"),
        (16, "18:30", "motivation_agent",
         "Bugün çok yorgunum, iş çok yoğundu. Antrenmanı atlasam olur mu?",
         "Elbette olur. Dinlenmek de antrenmanın bir parçası ve bir günlük ara ilerlemeni bozmaz. Bu hafta zaten "
         "düzenli gidiyorsun.\n\nİstersen 20-30 dakikalık sakin bir yürüyüş kafanı dağıtmaya iyi gelebilir, ama "
         "hiçbir şey yapmadan dinlenmek de tamamen geçerli bir seçim. Bu akşam erken yatmayı dene, yarın daha "
         "enerjik başlarsın. 😊"),
        (12, "22:10", "exercise_agent",
         "Son squat antrenmanında belimde hafif bir gerginlik hissettim. Formumda sorun olabilir mi?",
         "Squat'ta bel gerginliğinin en sık nedenleri şunlar:\n\n"
         "- **Karın sıkılığı:** İnmeden önce derin nefes al ve karnını 'darbe bekliyormuş gibi' sık.\n"
         "- **Derinlik:** Çok aşağıda belin yuvarlaklaşıyorsa (butt wink), biraz daha yukarıda dur.\n"
         "- **Gövde açısı:** Göğsü dik tut, ağırlığı ayağın ortasında hisset.\n\n"
         "Bir sonraki antrenmanda ağırlığı biraz azaltıp kendini yandan videoya çekmek formu görmenin en kolay yolu. "
         "Gerginlik ağrıya dönüşür ya da birkaç gün içinde geçmezse bir fizyoterapiste görünmeni öneririm."),
        (8, "18:20", "nutrition_agent",
         "Akşam yemeği için 600 kalori civarında hafif bir şey önerir misin?",
         "Tabii, birkaç fikir:\n\n"
         "- **Izgara levrek (250 g) + bol mevsim salata + 1 dilim tam buğday ekmeği** - yaklaşık 500 kcal, protein yüksek\n"
         "- **Mercimek çorbası + tavuk sote + biraz pilav** - doyurucu ve dengeli, ~600 kcal\n"
         "- **Zeytinyağlı taze fasulye + ızgara tavuk + yoğurt** - hafif ve sebze ağırlıklı\n\n"
         "Bugün proteinin biraz geride, o yüzden ilk seçenek en iyisi olabilir. Afiyet olsun!"),
        (5, "19:45", "workout_tracking_agent",
         f"Bugün {f['run5_min']} dakika orta tempoda koştum",
         f"Süper! 🏃 Koşunu kaydettim: **Koşu, {f['run5_min']} dakika, orta tempo**, yaklaşık "
         f"**{_int(f['run5_kcal'])} kcal**.\n\nKoşu hedefin 40 dakikaydı; ilk haftalarda 25 dakika koşuyordun, "
         f"hedefe sadece {40 - int(f['run5_min'])} dakika kaldı. Bu tempoyla birkaç hafta içinde ulaşırsın!"),
        (4, "21:30", "tracking_agent",
         "Kilo vermem yavaşladı mı sence?",
         f"Verilere bakınca yavaşlama görünmüyor. Son 4 haftada {_fmt(f['w33'])} kg'dan {_fmt(f['w5'])} kg'a indin "
         f"(**{_fmt(f['w33'] - f['w5'])} kg**), yani haftada ortalama {_fmt((f['w33'] - f['w5']) / 4)} kg - kas "
         f"kaybını en aza indiren sağlıklı aralıkta.\n\nGünlük tartıda birkaç yüz gramlık iniş çıkışlar su ve "
         f"tuzdan kaynaklanır; bu yüzden haftalık eğilime bakmak daha doğru. Bel ölçün de aynı dönemde "
         f"{_fmt(f['waist35'])} cm'den {_fmt(f['waist7'])} cm'ye inmiş, bu da kaybın büyük kısmının yağdan "
         f"geldiğini gösteriyor. 👏"),
        (2, "09:20", "nutrition_tracking_agent",
         "Sabah 2 haşlanmış yumurta, 40 gram beyaz peynir, 2 dilim tam buğday ekmeği, bir domates ve birkaç zeytin yedim",
         f"Günaydın! Kahvaltını kaydettim:\n\n"
         f"- Yumurta, haşlanmış - 100 g (2 adet)\n- Beyaz peynir - 40 g\n- Tam buğday ekmeği - 60 g (2 dilim)\n"
         f"- Domates - 100 g\n- Siyah zeytin - 20 g\n\n"
         f"Toplam yaklaşık **{_int(f['bf2_kcal'])} kcal**, **{_int(f['bf2_protein'])} g protein**. Güne güzel başladın!"),
        (1, "20:10", "tracking_agent",
         "Bu hafta adımlarım nasıl gidiyor?",
         f"Apple Sağlık verilerine göre son 7 günde günde ortalama **{_int(f['steps_avg'])} adım** attın. "
         f"En hareketli günün {_int(f['steps_max'])} adımla koşu günündü, en sakin günün ise "
         f"{_int(f['steps_min'])} adım.\n\nOrtalama bir günde adımların yaklaşık **{_int(f['steps_kcal'])} kcal** "
         f"yaktırıyor. Bu yalnız bilgi amaçlı: kalori hedefin aktivite seviyeni zaten hesaba katıyor, o yüzden "
         f"günlük bütçene eklenmiyor. Dinlenme günlerinde kısa bir yürüyüş ortalamanı daha da yukarı taşır. 🚶"),
        (1, "21:00", "tracking_agent",
         "Bu hafta nasıl gidiyorum?",
         f"Güzel gidiyorsun! Son 7 günde **{f['week_workouts']} antrenman** yaptın, haftalık 4 günlük hedefini "
         f"geçtin. Serin {f['streak']} gündür kesintisiz devam ediyor. 🔥\n\n"
         f"Kilon {_fmt(f['w_now'])} kg, hedefin 77 kg; başladığından beri {_fmt(f['w_start'] - f['w_now'])} kg verdin. "
         f"Protein ortalaman günde {_int(f['protein_avg'])} g, hedefin 150 g - atıştırmalıkta süzme yoğurt "
         f"ya da akşam yemeğinde biraz daha tavuk/balık bu farkı kapatır. Bu tempoyu korumaya devam! 💪"),
    ]


REVIEW_PLAIN = [
    "Haftalık değerlendirmen hazır: Bu hafta {n} gün antrenman yaptın ve haftalık hedefini tamamladın 🎉 "
    "Kilon {start} kg'dan {end} kg'a indi. Ruh halin de çoğu gün iyiydi; bu dengeyi koru!",
    "Bu hafta {n} antrenmanla haftalık hedefine yine ulaştın. Kilon {start} kg'dan {end} kg'a indi, yani "
    "planladığımız sağlıklı hızda gidiyorsun. Önümüzdeki hafta proteinde biraz daha istikrar sağlarsan harika olur.",
]
REVIEW_TIRED = (
    "Yoğun bir haftaydı ama {n} gün antrenmanı yine de çıkardın, bu çok değerli 👏 Kilon {end} kg. "
    "Yorgun hissettiğin günlerde dinlenmek de plana dahil, kendine iyi bak."
)
REVIEW_LATEST = (
    "Haftalık değerlendirmen hazır: Bu hafta {n} gün antrenman yaptın ve haftalık hedefini tamamladın 🎉 "
    "Kilon {start} kg'dan {end} kg'a indi. Squat'ta güçlü gidiyorsun; bir sonraki bacak gününde küçük bir "
    "adımla {squat} kg'ı denemeye hazırsın."
)
TIRED_DAY = 16  # sohbette "çok yorgunum" denen, antrenmanın atlandığı gün


def _weekly_reviews(facts: Facts, weeks: list[tuple[date, int, int, float, float]]) -> list[tuple[date, str]]:
    """weeks: (pazar, pazarın ofseti, o hafta antrenman sayısı, hafta başı kilo, hafta sonu kilo), eskiden yeniye."""
    out = []
    plain = 0
    for i, (sunday, sunday_offset, n, start, end) in enumerate(weeks):
        if i == len(weeks) - 1:
            template = REVIEW_LATEST
        elif sunday_offset <= TIRED_DAY <= sunday_offset + 6:
            template = REVIEW_TIRED
        else:
            template = REVIEW_PLAIN[plain % len(REVIEW_PLAIN)]
            plain += 1
        text = template.format(n=n, start=_fmt(start), end=_fmt(end), squat=_fmt(facts["squat_next"]))
        out.append((sunday, text))
    return out


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
            "daily_calorie_goal": CALORIE_GOAL,
            "daily_protein_goal_g": 150.0,
            "daily_carbs_goal_g": 190.0,
            "daily_fat_goal_g": 65.0,
            "weekly_workout_goal_days": 4,
            "height_cm": HEIGHT_CM,
            "birth_year": 1995,
            "sex": "male",
            "preferred_language": "tr",
            "coach_tone": "sicak",
        },
    )

    catalog = _catalog(db)
    today = user_today(db, user.id)
    protein_by_offset: dict[int, float] = {}
    workouts_by_day: dict[date, str] = {}
    cardio_kcal: dict[int, float | None] = {}
    weights: dict[int, float] = {}
    waists: dict[int, float] = {}

    for offset in range(DAYS, -1, -1):
        day = today - timedelta(days=offset)
        day_protein = 0.0
        for meal_type, items in plan_day(catalog, day, offset):
            for fdc_id, grams in items:
                nutrition_log_service.log_meal(db, user.id, catalog[fdc_id].id, grams, meal_type, day, "tr")
            day_protein += _totals(catalog, items)[1]
        protein_by_offset[offset] = day_protein

        kind = _workout_kind(offset)
        if kind is not None:
            cardio_kcal[offset] = _log_workout(db, user.id, kind, day, offset)
            workouts_by_day[day] = kind

        if offset % 7 in (0, 2, 5):  # haftada üç tartı, pazar bel + yağ
            weekly = offset % 7 == 0
            weights[offset] = body_weight(day, offset)
            if weekly:
                waists[offset] = round(95.0 - 0.5 * _week(offset), 1)
            progress_service.log_progress(
                db,
                user.id,
                weight=weights[offset],
                waist_cm=waists.get(offset),
                body_fat_pct=round(24.6 - 0.32 * _week(offset), 1) if weekly else None,
                log_date=day,
            )
        if offset != MOOD_FORGOTTEN:
            mood = MOOD_OVERRIDES.get(offset) or MOOD_CYCLE[day.toordinal() % len(MOOD_CYCLE)]
            mood_service.log_mood(db, user.id, mood, day)

    # Apple Sağlık adımları (ayrı rıza dahil, gerçek akıştaki gibi; telefon en fazla 31 gün eşitler).
    step_service.give_steps_consent(db, user.id)
    step_days = [(today - timedelta(days=o), daily_steps(today - timedelta(days=o), o))
                 for o in range(MAX_STEP_SYNC_DAYS - 1, -1, -1)]
    step_service.sync_steps(db, user.id, step_days)

    # Hedefler: bench ulaşılmış, squat/deadlift yolda (ilerleme çubuğu), koşu süre hedefi.
    for source_id, kg, reps, minutes in (
        ("Barbell_Bench_Press_-_Medium_Grip", 75.0, 6, None),  # ulaşılmış (rozet)
        ("Barbell_Squat", 100.0, 5, None),
        ("Barbell_Deadlift", 130.0, 5, None),
        ("Running", None, None, 40.0),
    ):
        catalog_id, name = _exercise(db, source_id, "tr")
        exercise_goal_service.set_exercise_goal(
            db, user.id, name, target_weight_kg=kg, exercise_catalog_id=catalog_id,
            target_reps=reps, target_duration_minutes=minutes,
        )

    # Sohbet ve bildirim metinlerindeki sayılar kurulan veriden.
    last7 = [steps for d, steps in step_days if 1 <= (today - d).days <= 7]
    steps_avg = sum(last7) / len(last7)
    lunch26 = _totals(catalog, FORCED_MEALS[(26, "öğle")])
    bf2 = _totals(catalog, FORCED_MEALS[(2, "kahvaltı")])
    facts: Facts = {
        "lunch26_kcal": lunch26[0], "lunch26_protein": lunch26[1],
        "bf2_kcal": bf2[0], "bf2_protein": bf2[1],
        "bench_stuck": lift_kg(65.0, 2.5, 2.5, 20),
        "run5_min": run_minutes(5), "run5_kcal": cardio_kcal.get(5) or 0,
        "w33": weights[33], "w5": weights[5], "waist35": waists[35], "waist7": waists[7],
        "steps_avg": steps_avg, "steps_max": max(last7), "steps_min": min(last7),
        "steps_kcal": step_service.estimate_step_calories(round(steps_avg), weights[2], HEIGHT_CM, "male") or 0,
        "week_workouts": sum(1 for d in workouts_by_day if 1 <= (today - d).days <= 7),
        "streak": progress_service.calculate_daily_streak(db, user.id, today),
        "w_now": weights[0], "w_start": weights[DAYS],
        "protein_avg": sum(protein_by_offset[o] for o in range(1, 8)) / 7,
        "squat_next": lift_kg(80.0, 2.5, 2, 0),  # bugünkü rekor ağırlık
    }

    for offset, hhmm, agent, question, answer in _chat(facts):
        at = _local(today - timedelta(days=offset), hhmm)
        db.add(Conversation(user_id=user.id, role="user", content=question, timestamp=at))
        db.add(Conversation(user_id=user.id, role="assistant", content=answer, agent_used=agent,
                            timestamp=at + timedelta(seconds=6)))

    # Son 4 pazarın haftalık değerlendirmesi (en yenisi okunmamış) + seri hatırlatması.
    def weight_as_of(day: date) -> float:
        """O güne kadarki son tartı."""
        return weights[min(o for o in weights if o >= (today - day).days)]

    weeks = []
    last_sunday = today - timedelta(days=(today.weekday() + 1) % 7 or 7)
    for k in range(3, -1, -1):
        sunday = last_sunday - timedelta(weeks=k)
        n = sum(1 for d in workouts_by_day if sunday - timedelta(days=6) <= d <= sunday)
        start, end = weight_as_of(sunday - timedelta(weeks=1)), weight_as_of(sunday)  # önceki haftaya göre
        weeks.append((sunday, (today - sunday).days, n, start, end))
    reviews = _weekly_reviews(facts, weeks)
    for i, (sunday, text) in enumerate(reviews):
        unread = i == len(reviews) - 1
        db.add(CheckinMessage(user_id=user.id, kind="weekly_summary", message=text,
                              generated_at=_local(sunday, "12:00"), delivered=not unread,
                              delivered_at=None if unread else _local(sunday, "12:05")))
    nudge_day = today - timedelta(days=MOOD_FORGOTTEN)
    db.add(CheckinMessage(
        user_id=user.id, kind="daily_nudge",
        message="Bugün ruh halini henüz kaydetmedin; serin devam etsin diye gün bitmeden bir dokunuşla "
                "ekleyebilirsin. Günün nasıl geçti? 😊",
        generated_at=_local(nudge_day, "18:00"), delivered=True, delivered_at=_local(nudge_day, "18:20"),
    ))
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
