from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.agents.turn_dedup import TurnDedupGuard
from app.services import food_catalog_service, nutrition_log_service, profile_service
from app.services.fuzzy_match import tr_lower


class MealItem(BaseModel):
    food_name: str = Field(
        description=(
            "Besin adı; kullanıcı pişirme durumunu belirtmişse (çiğ, pişmiş, "
            "haşlanmış, ızgara vb.) MUTLAKA dahil et, atlama — katalogda aynı "
            "besinin çiğ ve pişmiş hali ayrı ayrı ve ÇOK FARKLI kalori "
            "değerleriyle kayıtlı, bu yüzden bu bilgi kaybolursa yanlış kalori "
            "hesaplanır. Örn: 'ızgara tavuk göğsü', 'haşlanmış yeşil mercimek'."
        )
    )
    quantity_grams: float = Field(description="Miktar (gram)")
    meal_type: str = Field(description="kahvaltı, öğle, akşam veya atıştırmalık")


def build_nutrition_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    # bkz. workout_tracking_agent.py::build_workout_tracking_tools'taki aynı
    # gerekçe - dil tercihi bu turda bir kez okunup food_name_snapshot
    # seçiminde kullanılır.
    _language = profile_service.get_language(db, user_id)

    # workout_tracking_agent.py::_is_exact_repeat'in AYNI koruması burada
    # yoktu (2026-08-10 pürüz taraması, Tema D) - orada 2026-08-05 canlı
    # testinde bulunan "uzun/çok öğeli mesajda modelin tool-call zincirinde
    # kendi önceki çıktısını unutup aynı seti ikinci kez üretmesi" bug'ına
    # karşı eklenmişti; aynı LLM davranışı besin tarafında da olursa aynı
    # öğün sessizce iki kez kaydedilip günlük kalori toplamı şişebilirdi,
    # hiçbir uyarı/log yoktu. O turda BİREBİR aynı kod buraya kopyalanmıştı -
    # 2026-08-10 mimari borç raporu, bulgu #4'te ortak TurnDedupGuard'a taşındı.
    _dedup_guard: TurnDedupGuard[tuple[float, str]] = TurnDedupGuard()
    # workout_tracking_agent.py'deki AYNI çapraz-tur açığı burada da vardı
    # (canlı testte doğrulandı, 2026-08-31) - guard'ı SADECE bu turla değil,
    # BUGÜN DB'de zaten kayıtlı öğünlerle de "seed" et (bkz.
    # nutrition_log_service.list_today_meals_by_food docstring'i).
    for _key, _items in nutrition_log_service.list_today_meals_by_food(db, user_id).items():
        _dedup_guard.seed(_key, _items)

    # İSİMDEN BAĞIMSIZ, ikinci bir güvenlik ağı - workout_tracking_agent.
    # py'deki AYNI bulgu (canlı testte bulundu, 2026-08-31): model TEK bir
    # turda bulk tool'u İKİ KEZ çağırıp ikinci seferde besin isimlerini
    # HALÜSİNASYONLA FARKLI üretebiliyor - sayısal değerler (miktar) birebir
    # aynıyken isim farklı olduğunca isim-bazlı _dedup_guard bunu
    # yakalayamaz. MealEntry'de workout'un aksine bir "oturum" kavramı
    # olmadığı için (her satır bağımsız) DB'den BUGÜNÜ seed etmek pratik
    # değil - bu güvenlik ağı SADECE bu tur için (aynı riskin en sık
    # gözlendiği, tek turdaki çifte-çağrı durumu) tutuluyor.
    _seen_meal_call_fingerprints: set[tuple] = set()

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
        """Kullanıcının yediği BİR besini (isim, gram cinsinden miktar, öğün
        türü) kaydeder; kalori/protein/karbonhidrat/yağ değerleri katalogdan
        otomatik hesaplanır. food_name'de kullanıcının belirttiği pişirme
        durumunu (çiğ, pişmiş, haşlanmış, ızgara vb.) MUTLAKA koru, atlama —
        katalogda aynı besinin çiğ ve pişmiş hali ayrı ve ÇOK FARKLI kalori
        değerleriyle kayıtlı. meal_type şu değerlerden biri olmalı: kahvaltı,
        öğle, akşam, atıştırmalık. Kullanıcı '150 gram tavuk göğsü yedim' gibi
        SADECE TEK bir besin belirttiğinde bu aracı çağır — bu genel bilgi
        sorularında kullanılan search_nutrition_knowledge ile KARIŞTIRMA, bu
        araç somut bir öğün KAYDI içindir. Kullanıcı AYNI mesajda birden fazla
        besin belirtirse bu aracı tekrar tekrar ÇAĞIRMA, log_meals_bulk'u tüm
        besinlerle TEK seferde çağır. Besin katalogda net bulunamazsa
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

        # Dedup kontrolü KANONİK isimle yapılıyor, HAM `food_name` DEĞİL -
        # guard'ın "bugün DB'de zaten var" seed'i DB'deki kanonik snapshot
        # isimlerinden okunuyor (bkz. log_meals_bulk'taki aynı gerekçe, canlı
        # testte bulundu 2026-08-31); ham metin karşılaştırması turlar arası
        # tutarsız kalırdı (LLM aynı besni farklı ham ifadeyle yazabilir).
        canonical_name = food_catalog_service.canonical_name(match, food_name, _language)
        if _dedup_guard.is_exact_repeat(canonical_name, [(quantity_grams, meal_type)]):
            return (
                f"'{canonical_name}' için bu tam öğünü zaten kaydettin, tekrar "
                "kaydetmedim — aynı besini ikinci kez loglama."
            )

        try:
            entry = nutrition_log_service.log_meal(
                db,
                user_id,
                food_catalog_id=match.id,
                quantity_grams=quantity_grams,
                meal_type=meal_type,
                language=_language,
            )
        except ValueError as exc:
            return str(exc)

        return (
            f"Kaydedildi: {entry.food_name_snapshot} ({entry.quantity_grams:.0f}g, {entry.meal_type}) — "
            f"{entry.calories_kcal:.0f} kalori, {entry.protein_g:.0f}g protein, "
            f"{entry.carbs_g:.0f}g karbonhidrat, {entry.fat_g:.0f}g yağ."
        )

    @tool
    def log_meals_bulk(meals: list[MealItem]) -> str:
        """Kullanıcının TEK mesajda anlattığı BİRDEN FAZLA besini (2 veya
        daha fazla) TEK seferde kaydeder. Kullanıcı bir öğünün ya da günün
        tamamını tek mesajda anlatıyorsa (ör. '350 gram makarna ve 300 gram
        mercimek yedim') log_meal'i HER besin için tek tek çağırmak YERİNE bu
        aracı TERCİH ET: tüm besinleri TEK bir listeyle, TEK çağrıda ilet.
        Kullanıcı sadece TEK bir besin anlatıyorsa (ör. '150 gram tavuk
        yedim') log_meal'i kullan. Katalogda net eşleşmeyen besinler kalori/
        makro hesaplanamadığı için ATLANIR (asla tahmini değerle kaydedilmez)
        — sonuç metninde hangi besinlerin atlandığı ve en yakın adayların ne
        olduğu bildirilir; bunları kullanıcıya sorup netleşince log_meal ile
        tekrar kaydet."""
        # İsimden BAĞIMSIZ tekrar kontrolü (bkz. yukarıdaki
        # _seen_meal_call_fingerprints yorumu) - bu çağrının TÜM
        # besinlerinin sayısal içeriği (miktar, öğün türü) bu turda daha
        # önce görülen bir çağrıyla birebir aynıysa, isimler ne olursa
        # olsun TAMAMEN atla. Besin isim çözümlemesinden ÖNCE yapılıyor ki
        # yanlış/halüsinasyonlu isimler hiç DB'ye yazılmasın.
        meal_call_fingerprint = tuple(
            sorted(((item.quantity_grams, item.meal_type) for item in meals), key=str)
        )
        if meal_call_fingerprint and meal_call_fingerprint in _seen_meal_call_fingerprints:
            return (
                "Bu besinlerin TAMAMI (aynı miktar/öğün kombinasyonuyla) bu turda zaten "
                "kaydedilmiş görünüyor, tekrar kaydetmedim - muhtemelen aynı öğünü farklı "
                "bir ifadeyle ikinci kez anlatıyorsun."
            )
        if meal_call_fingerprint:
            _seen_meal_call_fingerprints.add(meal_call_fingerprint)

        # Her eleman için önce katalog eşleşmesini/kanonik ismi çözümle -
        # dedup gruplaması buna göre yapılacak, HAM LLM metnine göre DEĞİL
        # (bkz. log_exercise_sets_bulk'taki aynı gerekçe, canlı testte
        # bulundu 2026-08-31). Eşleşmeyen besinler için canonical=None
        # işaretlenir, aşağıdaki döngüde normal şekilde "bulunamadı" olarak
        # raporlanır.
        resolved_matches: list[tuple[object | None, float]] = []
        for item in meals:
            match, score = food_catalog_service.best_match(db, item.food_name)
            resolved_matches.append((match, score))

        # KANONİK isme göre grupla (bkz. _dedup_guard) - her besinin bu
        # çağrıdaki TÜM girdileri, DAHA ÖNCE (bu turda VEYA bugün DB'de)
        # kaydedilenle birebir aynıysa TAMAMI atlanır (uzun mesajlarda
        # modelin aynı besini ikinci kez loglaması engellenir). Katalogda
        # eşleşmeyen besinler ham isimleriyle gruplanır (kanonik isim yok).
        order: list[str] = []
        indices_by_key: dict[str, list[int]] = {}
        dedup_name_by_key: dict[str, str] = {}
        for idx, item in enumerate(meals):
            match, score = resolved_matches[idx]
            if match is not None and score >= food_catalog_service.FUZZY_MATCH_THRESHOLD:
                dedup_name = food_catalog_service.canonical_name(match, item.food_name, _language)
            else:
                dedup_name = item.food_name
            key = tr_lower(dedup_name.strip())
            indices_by_key.setdefault(key, []).append(idx)
            dedup_name_by_key[key] = dedup_name
            if key not in order:
                order.append(key)

        skip_indices: set[int] = set()
        skipped_repeats: list[str] = []
        for key in order:
            idxs = indices_by_key[key]
            items_tuples = [(meals[i].quantity_grams, meals[i].meal_type) for i in idxs]
            if _dedup_guard.is_exact_repeat(dedup_name_by_key[key], items_tuples):
                skip_indices.update(idxs)
                skipped_repeats.append(dedup_name_by_key[key])

        logged: list[str] = []
        skipped: list[str] = [f"'{name}' zaten kaydedilmişti" for name in skipped_repeats]
        for idx, item in enumerate(meals):
            if idx in skip_indices:
                continue
            match, score = resolved_matches[idx]
            if match is None or score < food_catalog_service.FUZZY_MATCH_THRESHOLD:
                candidates = food_catalog_service.search_foods(db, item.food_name, limit=3)
                if candidates:
                    names = ", ".join(candidate.name_tr for candidate in candidates)
                    skipped.append(f"'{item.food_name}' net bulunamadı (adaylar: {names})")
                else:
                    skipped.append(f"'{item.food_name}' katalogda yok")
                continue

            try:
                entry = nutrition_log_service.log_meal(
                    db,
                    user_id,
                    food_catalog_id=match.id,
                    quantity_grams=item.quantity_grams,
                    meal_type=item.meal_type,
                    language=_language,
                )
            except ValueError as exc:
                skipped.append(f"'{item.food_name}': {exc}")
                continue

            logged.append(
                f"{entry.food_name_snapshot} ({entry.quantity_grams:.0f}g, {entry.meal_type}, "
                f"{entry.calories_kcal:.0f} kalori)"
            )

        parts = []
        if logged:
            parts.append(f"{len(logged)} öğün kaydedildi: " + "; ".join(logged) + ".")
        if skipped:
            parts.append("Kaydedilemeyenler: " + "; ".join(skipped) + ".")
        return " ".join(parts) if parts else "Hiçbir besin kaydedilmedi."

    @tool
    def get_daily_nutrition_summary() -> str:
        """Kullanıcının bugünkü toplam kalori/protein/karbonhidrat/yağ alımının
        özetini döndürür (kullanıcı günlük hedef belirlediyse karşılaştırma
        yüzdesiyle birlikte). Kullanıcı 'bugün ne kadar kalori aldım' gibi bir
        şey sorduğunda bu aracı çağır."""
        return nutrition_log_service.generate_daily_nutrition_summary(db, user_id).as_text()

    return [search_food_catalog, log_meal, log_meals_bulk, get_daily_nutrition_summary]
