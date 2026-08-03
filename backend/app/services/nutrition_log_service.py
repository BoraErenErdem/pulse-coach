from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.food_catalog import FoodCatalog
from app.models.meal_entry import MealEntry
from app.models.user_profile import UserProfile

VALID_MEAL_TYPES = {"kahvaltı", "öğle", "akşam", "atıştırmalık"}


@dataclass
class DailyNutritionSummary:
    entry_count: int
    total_calories_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    total_sugar_g: float = 0.0
    total_sodium_mg: float = 0.0
    total_fiber_g: float = 0.0
    calorie_goal: float | None = None
    protein_goal_g: float | None = None
    carbs_goal_g: float | None = None
    fat_goal_g: float | None = None

    def as_text(self) -> str:
        if self.entry_count == 0:
            return "Bugün için herhangi bir öğün kaydı girilmemiş."

        parts = [
            f"Bugün {self.entry_count} öğün kaydedilmiş: toplam {self.total_calories_kcal:.0f} kalori, "
            f"{self.total_protein_g:.0f}g protein, {self.total_carbs_g:.0f}g karbonhidrat, "
            f"{self.total_fat_g:.0f}g yağ alınmış."
        ]
        if self.calorie_goal:
            pct = self.total_calories_kcal / self.calorie_goal * 100
            parts.append(f"Günlük kalori hedefinin (%{pct:.0f}'i, {self.calorie_goal:.0f} kcal) karşılanmış.")
        if self.protein_goal_g:
            pct = self.total_protein_g / self.protein_goal_g * 100
            parts.append(f"Protein hedefinin %{pct:.0f}'i karşılanmış.")
        if self.total_fiber_g > 0:
            parts.append(f"Ayrıca {self.total_fiber_g:.0f}g lif alınmış.")
        return " ".join(parts)


def log_meal(
    db: Session,
    user_id: int,
    food_catalog_id: int,
    quantity_grams: float,
    meal_type: str,
    log_date: date_type | None = None,
) -> MealEntry:
    """Besin kataloğundan bir besini belirtilen miktarda öğüne kaydeder,
    kalori/makro değerleri log anında hesaplanıp snapshot'lanır. Hem
    Beslenme Takip Agent tool'u hem de POST /nutrition/entries endpoint'i bu
    fonksiyonu çağırır — tek iş mantığı katmanı.

    food_catalog_id kasıtlı olarak ZORUNLU: kalori/makro değerleri ancak
    katalogdan gelen kesin verilerle hesaplanabilir, LLM'in tahmini bir
    değeri kaydetmesi (RAG halüsinasyon riskiyle aynı sorun) engellenir —
    eşleşen kayıt bulunamazsa arayan taraf (agent tool/frontend) önce
    search_foods ile kullanıcıya doğru kaydı seçtirmeli."""
    if meal_type not in VALID_MEAL_TYPES:
        raise ValueError(f"Geçersiz öğün türü: {meal_type}")
    if quantity_grams <= 0:
        raise ValueError("Miktar (gram) sıfırdan büyük olmalı.")

    food = db.query(FoodCatalog).filter(FoodCatalog.id == food_catalog_id).first()
    if food is None:
        raise ValueError("Belirtilen besin kataloğunda bulunamadı.")

    factor = quantity_grams / 100.0
    entry = MealEntry(
        user_id=user_id,
        food_catalog_id=food.id,
        food_name_snapshot=food.name_tr,
        meal_type=meal_type,
        quantity_grams=quantity_grams,
        calories_kcal=food.calories_kcal * factor,
        protein_g=food.protein_g * factor,
        carbs_g=food.carbs_g * factor,
        fat_g=food.fat_g * factor,
        sugar_g=food.sugar_g * factor if food.sugar_g is not None else None,
        sodium_mg=food.sodium_mg * factor if food.sodium_mg is not None else None,
        fiber_g=food.fiber_g * factor if food.fiber_g is not None else None,
        log_date=log_date or datetime.now(timezone.utc).date(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_meal_entries(
    db: Session, user_id: int, days: int | None = None, limit: int | None = None
) -> list[MealEntry]:
    """Kullanıcının öğün kayıtlarını tarih sırasıyla döndürür. `days`
    verilirse sadece son o kadar günü, `limit` verilirse en fazla o kadar
    (en yeni) kaydı döndürür."""
    query = db.query(MealEntry).filter(MealEntry.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc).date() - timedelta(days=days)
        query = query.filter(MealEntry.log_date >= since)
    if limit is not None:
        query = query.order_by(MealEntry.log_date.desc(), MealEntry.created_at.desc()).limit(limit)
        return list(reversed(query.all()))
    return query.order_by(MealEntry.log_date.asc(), MealEntry.created_at.asc()).all()


def delete_meal_entry(db: Session, user_id: int, entry_id: int) -> bool:
    """Bir öğün kaydını siler. Bulunamazsa (ya da başka kullanıcıya aitse)
    False döner."""
    entry = db.query(MealEntry).filter(MealEntry.id == entry_id, MealEntry.user_id == user_id).first()
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True


def update_meal_entry(
    db: Session,
    user_id: int,
    entry_id: int,
    quantity_grams: float | None = None,
    meal_type: str | None = None,
) -> MealEntry | None:
    """Bir öğün kaydının miktarını ve/veya öğün türünü günceller. Miktar
    değişirse kalori/makrolar kayıtlı `food_catalog_id`'den yeniden
    hesaplanır (tahmini değer YAZILMAZ, katalog tekrar sorgulanır — `log_meal`
    ile aynı ilke). Bulunamazsa None döner."""
    entry = db.query(MealEntry).filter(MealEntry.id == entry_id, MealEntry.user_id == user_id).first()
    if entry is None:
        return None

    if meal_type is not None:
        if meal_type not in VALID_MEAL_TYPES:
            raise ValueError(f"Geçersiz öğün türü: {meal_type}")
        entry.meal_type = meal_type

    if quantity_grams is not None:
        if quantity_grams <= 0:
            raise ValueError("Miktar (gram) sıfırdan büyük olmalı.")
        if entry.food_catalog_id is None:
            raise ValueError("Bu kayıt bir katalog besinine bağlı değil, miktarı yeniden hesaplanamaz.")
        food = db.query(FoodCatalog).filter(FoodCatalog.id == entry.food_catalog_id).first()
        if food is None:
            raise ValueError("Belirtilen besin kataloğunda bulunamadı.")
        factor = quantity_grams / 100.0
        entry.quantity_grams = quantity_grams
        entry.calories_kcal = food.calories_kcal * factor
        entry.protein_g = food.protein_g * factor
        entry.carbs_g = food.carbs_g * factor
        entry.fat_g = food.fat_g * factor
        entry.sugar_g = food.sugar_g * factor if food.sugar_g is not None else None
        entry.sodium_mg = food.sodium_mg * factor if food.sodium_mg is not None else None
        entry.fiber_g = food.fiber_g * factor if food.fiber_g is not None else None

    db.commit()
    db.refresh(entry)
    return entry


def generate_daily_nutrition_summary(
    db: Session, user_id: int, log_date: date_type | None = None
) -> DailyNutritionSummary:
    """Belirtilen günün (verilmezse bugünün) beslenme özetini döndürür.
    Kullanıcının UserProfile'ında günlük hedef alanları doluysa karşılaştırma
    yüzdesini de içerir, boşsa sadece ham toplamı döner. Hem Beslenme Takip
    Agent tool'u hem de GET /nutrition/daily-summary endpoint'i bu fonksiyonu
    çağırır."""
    target_date = log_date or datetime.now(timezone.utc).date()
    entries = (
        db.query(MealEntry)
        .filter(MealEntry.user_id == user_id, MealEntry.log_date == target_date)
        .all()
    )

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()

    return DailyNutritionSummary(
        entry_count=len(entries),
        total_calories_kcal=sum(e.calories_kcal for e in entries),
        total_protein_g=sum(e.protein_g for e in entries),
        total_carbs_g=sum(e.carbs_g for e in entries),
        total_fat_g=sum(e.fat_g for e in entries),
        total_sugar_g=sum(e.sugar_g for e in entries if e.sugar_g is not None),
        total_sodium_mg=sum(e.sodium_mg for e in entries if e.sodium_mg is not None),
        total_fiber_g=sum(e.fiber_g for e in entries if e.fiber_g is not None),
        calorie_goal=profile.daily_calorie_goal if profile else None,
        protein_goal_g=profile.daily_protein_goal_g if profile else None,
        carbs_goal_g=profile.daily_carbs_goal_g if profile else None,
        fat_goal_g=profile.daily_fat_goal_g if profile else None,
    )
