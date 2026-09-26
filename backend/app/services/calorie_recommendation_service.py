"""Boy/yaş/cinsiyet/kilo ve aktiviteye göre günlük kalori + makro önerisi
(2026-09-26).

Öneri SADECE gösterilir - hedefleri kendisi yazmaz; kullanıcı "alanlara
doldur" deyip kaydederse PATCH /profile ile hedef olur.

- Bazal metabolizma: Mifflin-St Jeor (yetişkinlerde en iyi doğrulanmış tahmin).
- Günlük harcama: BMR x aktivite katsayısı (FAO/WHO'nun yaygın 1.2-1.725 basamakları).
- Hedef ayarı: kilo verme -500 kcal ama harcamanın %20'sinden fazla açık
  verilmez; kas yapma +250 kcal (yavaş, yağ birikimini sınırlayan fazla);
  genel sağlık / hedef yok = koruma.
- Alt sınır: kadın 1200, erkek 1500 kcal (gözetimsiz düşük kalorinin yaygın
  güvenli tabanı).
- Makrolar: protein kg başına (kilo verme 1.6, kas 1.8, genel 1.2 g; genelde
  orta/çok aktifse 1.4 g - düzenli antrenmanda önerilen 1.4-2.0 aralığının
  tabanı) ama kalorinin %35'ini aşmaz; yağ kalorinin %25'i, en az 0.6 g/kg (en fazla %35);
  kalan karbonhidrat. Kalori 10'a, gramlar 5'e yuvarlanır.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.services.profile_service import get_profile
from app.services.progress_service import get_latest_weight
from app.services.user_time import user_today

ACTIVITY_FACTORS = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}
PROTEIN_G_PER_KG = {"weight_loss": 1.6, "muscle_gain": 1.8, "general_health": 1.2}
ACTIVE_GENERAL_PROTEIN_G_PER_KG = 1.4
MUSCLE_GAIN_SURPLUS_KCAL = 250
WEIGHT_LOSS_DEFICIT_KCAL = 500
MAX_DEFICIT_RATIO = 0.20
MIN_CALORIES = {"female": 1200, "male": 1500}
FAT_SHARE = 0.25
MIN_FAT_G_PER_KG = 0.6
MAX_MACRO_SHARE = 0.35


@dataclass(frozen=True)
class Recommendation:
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    bmr: int
    tdee: int
    adjustment_kcal: int
    goal: str


def _round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def compute_recommendation(
    *, weight_kg: float, height_cm: float, age: int, sex: str, activity_level: str, goal: str | None
) -> Recommendation:
    goal = goal if goal in PROTEIN_G_PER_KG else "general_health"
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + (5 if sex == "male" else -161)
    tdee = bmr * ACTIVITY_FACTORS[activity_level]

    if goal == "weight_loss":
        target = tdee - min(WEIGHT_LOSS_DEFICIT_KCAL, tdee * MAX_DEFICIT_RATIO)
    elif goal == "muscle_gain":
        target = tdee + MUSCLE_GAIN_SURPLUS_KCAL
    else:
        target = tdee
    calories = _round_to(max(target, MIN_CALORIES[sex]), 10)

    protein_per_kg = PROTEIN_G_PER_KG[goal]
    if goal == "general_health" and activity_level in ("moderate", "active"):
        protein_per_kg = ACTIVE_GENERAL_PROTEIN_G_PER_KG
    protein_g = min(protein_per_kg * weight_kg, calories * MAX_MACRO_SHARE / 4)
    fat_g = min(max(calories * FAT_SHARE / 9, MIN_FAT_G_PER_KG * weight_kg), calories * MAX_MACRO_SHARE / 9)
    carbs_g = max(calories - protein_g * 4 - fat_g * 9, 0) / 4

    return Recommendation(
        calories=calories,
        protein_g=_round_to(protein_g, 5),
        carbs_g=_round_to(carbs_g, 5),
        fat_g=_round_to(fat_g, 5),
        bmr=round(bmr),
        tdee=round(tdee),
        # Tabana takılınca gerçek fark, sabit -500 değil.
        adjustment_kcal=calories - _round_to(tdee, 10),
        goal=goal,
    )


def get_recommendation(db: Session, user_id: int) -> dict:
    """GET /profile/calorie-recommendation gövdesi (schemas.profile.CalorieRecommendation).
    Kilo, İlerleme'deki EN SON kilo kaydı; yaş kullanıcının yerel yılından."""
    profile = get_profile(db, user_id)
    weight = get_latest_weight(db, user_id)
    height = profile.height_cm if profile else None
    birth_year = profile.birth_year if profile else None
    sex = profile.sex if profile else None
    activity = profile.activity_level if profile else None
    goal = profile.goal if profile else None
    age = user_today(db, user_id).year - birth_year if birth_year is not None else None

    missing = [
        name
        for name, value in (
            ("height", height),
            ("birth_year", birth_year),
            ("sex", sex),
            ("weight", weight),
            ("activity_level", activity),
        )
        if value is None
    ]
    base = {
        "missing": missing,
        "activity_level": activity,
        "weight_kg": weight,
        "height_cm": height,
        "age": age,
        "sex": sex,
    }
    if missing:
        return {"available": False, "goal": goal, **base}
    # missing boşsa hepsi dolu - tip daraltması için assert.
    assert weight is not None and height is not None and age is not None and sex and activity
    rec = compute_recommendation(
        weight_kg=weight, height_cm=height, age=age, sex=sex, activity_level=activity, goal=goal
    )
    return {
        "available": True,
        "calories": rec.calories,
        "protein_g": rec.protein_g,
        "carbs_g": rec.carbs_g,
        "fat_g": rec.fat_g,
        "bmr": rec.bmr,
        "tdee": rec.tdee,
        "adjustment_kcal": rec.adjustment_kcal,
        "goal": rec.goal,
        **base,
    }
