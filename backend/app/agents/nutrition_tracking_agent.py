from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.services import food_catalog_service, nutrition_log_service


def build_nutrition_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def search_food_catalog(query: str) -> str:
        """Besin kataloğunda isimle arama yapar, en yakın eşleşen adayları
        Türkçe isimleriyle listeler. Kullanıcının söylediği besin adı kataloğa
        net eşleşmiyorsa (log_meal belirsiz adaylar döndürdüğünde) veya
        kullanıcı doğrudan bir besin aramak istediğinde bu aracı çağır."""
        results = food_catalog_service.search_foods(db, query)
        if not results:
            return "Katalogda bu aramaya uyan bir besin bulunamadı."
        return "Bulunan besinler: " + ", ".join(row.name_tr for row in results)

    @tool
    def log_meal(food_name: str, quantity_grams: float, meal_type: str) -> str:
        """Kullanıcının yediği bir besini (isim, gram cinsinden miktar, öğün
        türü) kaydeder; kalori/protein/karbonhidrat/yağ değerleri katalogdan
        otomatik hesaplanır. meal_type şu değerlerden biri olmalı: kahvaltı,
        öğle, akşam, atıştırmalık. Kullanıcı '150 gram tavuk göğsü yedim' gibi
        somut bir miktar belirttiğinde bu aracı çağır — bu genel bilgi
        sorularında kullanılan search_nutrition_knowledge ile KARIŞTIRMA, bu
        araç somut bir öğün KAYDI içindir. Besin katalogda net bulunamazsa
        (kalori/makro tahmin ETMEDEN) kullanıcıya en yakın adayları sor."""
        match, score = food_catalog_service.best_match(db, food_name)

        if match is None or score < food_catalog_service.FUZZY_MATCH_THRESHOLD:
            candidates = food_catalog_service.search_foods(db, food_name, limit=3)
            if candidates:
                names = ", ".join(candidate.name_tr for candidate in candidates)
                return (
                    f"'{food_name}' katalogda net olarak bulunamadı. Kullanıcıya şunlardan "
                    f"birini mi kastettiğini sor: {names}. Netleşince tekrar çağır."
                )
            return (
                f"'{food_name}' besin kataloğunda bulunamadı, bu yüzden kalori/makro "
                "hesaplanamadı ve kaydedilmedi. Kullanıcıya farklı bir isimle "
                "(ör. daha genel bir besin adıyla) tekrar denemesini söyle."
            )

        try:
            entry = nutrition_log_service.log_meal(
                db,
                user_id,
                food_catalog_id=match.id,
                quantity_grams=quantity_grams,
                meal_type=meal_type,
            )
        except ValueError as exc:
            return str(exc)

        return (
            f"Kaydedildi: {entry.food_name_snapshot} ({entry.quantity_grams:.0f}g, {entry.meal_type}) — "
            f"{entry.calories_kcal:.0f} kalori, {entry.protein_g:.0f}g protein, "
            f"{entry.carbs_g:.0f}g karbonhidrat, {entry.fat_g:.0f}g yağ."
        )

    @tool
    def get_daily_nutrition_summary() -> str:
        """Kullanıcının bugünkü toplam kalori/protein/karbonhidrat/yağ alımının
        özetini döndürür (kullanıcı günlük hedef belirlediyse karşılaştırma
        yüzdesiyle birlikte). Kullanıcı 'bugün ne kadar kalori aldım' gibi bir
        şey sorduğunda bu aracı çağır."""
        return nutrition_log_service.generate_daily_nutrition_summary(db, user_id).as_text()

    return [search_food_catalog, log_meal, get_daily_nutrition_summary]
