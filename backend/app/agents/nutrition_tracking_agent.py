from datetime import date

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.agents.log_date import past_date_note, resolve_log_date
from app.agents.turn_dedup import TurnDedupGuard
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service, nutrition_log_service, profile_service
from app.services.fuzzy_match import tr_lower
from app.services.user_time import user_today


class MealItem(BaseModel):
    food_name: str = Field(
        description=(
            "Besin adı; kullanıcı pişirme durumunu belirtmişse (çiğ, pişmiş, "
            "haşlanmış, ızgara vb.) MUTLAKA dahil et, atlama — katalogda aynı "
            "besinin çiğ ve pişmiş hali ayrı ayrı ve ÇOK FARKLI kalori "
            "değerleriyle kayıtlı, bu yüzden bu bilgi kaybolursa yanlış kalori "
            "hesaplanır. Örn: 'ızgara tavuk göğsü', 'haşlanmış yeşil mercimek'. "
            "Kullanıcı bir YEMEĞİN adını söylediyse (pastırmalı yumurta, sucuklu "
            "yumurta, menemen, İzmir köfte, kuru fasulye) adı AYNEN yaz - "
            "bileşenlerine bölme, niteleyiciyi atıp 'yumurta'ya kısaltma "
            "(2026-09-28 eval: 'pastırmalı yumurta' 3/3 sade yumurta kaydedildi). "
            "Gramı yemeğin tamamı için ver (ör. 2 yumurtalı pastırmalı/sucuklu "
            "yumurta ≈130g)."
        )
    )
    quantity_grams: float = Field(
        description=(
            "Miktar (gram). Kullanıcı miktarı doğrudan gram cinsinden vermemişse "
            "(adet/tane sayısı, su/çay bardağı, kaşık, dilim, avuç, yarım/çeyrek "
            "gibi), bunu makul bir birim ağırlıkla çarparak grama çevir — "
            "kullanıcının belirttiği SAYIYI göz ardı edip sabit/genel bir "
            "'porsiyon' değerine SIÇRAMA. Yaklaşık birim ağırlıklar: 1 badem "
            "≈1.2g, 1 ceviz içi ≈4-5g, 1 fındık ≈1g, 1 orta boy yumurta ≈50g, "
            "1 orta boy muz ≈120g, 1 orta boy elma ≈180g, 1 dilim ekmek ≈25-30g "
            "(tam buğday biraz daha ağır olabilir), 1 su bardağı (~200ml) sıvı/"
            "yoğurt/ayran ≈200g, 1 çay bardağı ≈100g, 1 yemek kaşığı ≈15g, 1 "
            "tatlı kaşığı ≈5g, 1 avuç kuruyemiş ≈30g, 1 zeytin ≈4g (5 zeytin ≈20g), "
            "1 dilim beyaz/kaşar peynir ≈30g, 1 küp şeker ≈3g, yulaf ezmesi KURU "
            "tartılır (1 yemek kaşığı ≈10g, 1 kase kuru ≈40-50g; pişmiş lapa ise "
            "'yulaf lapası' yaz). Hazır yemeklerde tipik "
            "porsiyonlar: 1 kase çorba ≈250g, 1 tabak sulu/sebze/baklagil yemeği "
            "≈250g, 1 porsiyon pilav/makarna ≈180g, 1 porsiyon börek ≈150g (1 dilim "
            "≈100g), 1 adet lahmacun ≈130g, 1 porsiyon döner/köfte/et ≈150g, 1 "
            "porsiyon salata ≈150g, 1 porsiyon sütlü/şerbetli tatlı ≈120g, 1 "
            "bardak ayran ≈250g - 'bir tabak'/'bir porsiyon' için bunları kullan, "
            "fazladan büyütme (canlı testte 'bir porsiyon su böreği' 350g=875 "
            "kcal yazılmıştı, 2026-09-27). 'Yarım'/'çeyrek' gibi "
            "kesirli ifadelerde önce bütün besinin tipik ağırlığını tahmin et, "
            "sonra kesri uygula (ör. 'yarım avokado' → tipik 1 avokado ~200g → "
            "100g). Kullanıcı 'yaklaşık'/'birkaç' gibi belirsiz bir sayı "
            "verdiyse SÖYLEDİĞİ SAYIYI ciddiye al ve onunla çarp (ör. "
            "'yaklaşık 10 tane badem' → 10×1.2g≈12g) — canlı testte bulundu "
            "(2026-09-14): bu durumda model sayıyı yok sayıp sabit 50g'lık "
            "genel bir kuruyemiş porsiyonuna yazmıştı (gerçek değerin 4 katı)."
        )
    )
    meal_type: str = Field(description="kahvaltı, öğle, akşam veya atıştırmalık")


def build_nutrition_tracking_tools(
    db: Session, user_id: int, expected_days_ago: int | None = None, language: str | None = None
) -> list[BaseTool]:
    # bkz. workout_tracking_agent.py::build_workout_tracking_tools'taki aynı
    # gerekçe - dil tercihi bu turda bir kez okunup food_name_snapshot
    # seçiminde kullanılır; `language` verilirse ekrandaki dil.
    _language = language or profile_service.get_language(db, user_id)

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
    for _key, _items in nutrition_log_service.list_today_meals_by_food(db, user_id, _language).items():
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

    # Guard'lar BUGÜNÜN kayıtlarıyla seed ediliyor - geçmiş güne (days_ago)
    # yazılan bir öğün anahtarına tarih eklenir, yoksa "dün de aynısını yedim"
    # bugünkü kaydın tekrarı sanılıp atlanırdı.
    _today = user_today(db, user_id)

    def _dedup_name(name: str, day: date) -> str:
        return name if day == _today else f"{name}@{day.isoformat()}"

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
    def log_meal(food_name: str, quantity_grams: float, meal_type: str, days_ago: int | None = None) -> str:
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
        (kalori/makro tahmin ETMEDEN) kullanıcıya en yakın adayları sor.
        days_ago: öğün GEÇMİŞ bir güne aitse (dün=1, evvelsi gün=2, en fazla
        7); bugün için boş bırak."""
        log_date = resolve_log_date(db, user_id, days_ago, expected_days_ago)
        if isinstance(log_date, str):
            return log_date
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
        if _dedup_guard.is_repeat(_dedup_name(canonical_name, log_date), [(quantity_grams, meal_type)]):
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
                log_date=log_date,
                language=_language,
            )
        except ValueError as exc:
            # "Kaydedilmedi" öneki: orkestratör bunu başarısız sayar. Düz hata
            # metni başarılı sayılıyor, model "kaydettim" deyince sahte kayıt
            # koruması devreye girmiyordu (2026-09-27 canlı test: yoğunluksuz kardiyo).
            return f"Kaydedilmedi: {exc}"
        # Tekrar koruması yalnız başarılı kayıttan sonra (bkz. TurnDedupGuard.is_repeat).
        _dedup_guard.seed(_dedup_name(canonical_name, log_date), [(quantity_grams, meal_type)])

        return (
            f"Kaydedildi: {entry.food_name_snapshot} ({entry.quantity_grams:.0f}g, {entry.meal_type}) — "
            f"{entry.calories_kcal:.0f} kalori, {entry.protein_g:.0f}g protein, "
            f"{entry.carbs_g:.0f}g karbonhidrat, {entry.fat_g:.0f}g yağ."
        ) + past_date_note(log_date, _today)

    @tool
    def log_meals_bulk(meals: list[MealItem], days_ago: int | None = None) -> str:
        """Kullanıcının TEK mesajda anlattığı BİRDEN FAZLA besini (2 veya
        daha fazla) TEK seferde kaydeder. Kullanıcı bir öğünün ya da günün
        tamamını tek mesajda anlatıyorsa (ör. '350 gram makarna ve 300 gram
        mercimek yedim') log_meal'i HER besin için tek tek çağırmak YERİNE bu
        aracı TERCİH ET: tüm besinleri TEK bir listeyle, TEK çağrıda ilet.
        Kullanıcının saydığı HER besini listeye koy - kalorisi sıfıra yakın
        olsa bile (çay, kahve, su): canlı testte "menemen, 2 dilim ekmek ve 2
        bardak çay" mesajında çay atlanıp yine de "kahvaltını kaydettim"
        denmişti (2026-09-27).
        Kullanıcı sadece TEK bir besin anlatıyorsa (ör. '150 gram tavuk
        yedim') log_meal'i kullan. Katalogda net eşleşmeyen besinler kalori/
        makro hesaplanamadığı için ATLANIR (asla tahmini değerle kaydedilmez)
        — sonuç metninde hangi besinlerin atlandığı ve en yakın adayların ne
        olduğu bildirilir; bunları kullanıcıya sorup netleşince log_meal ile
        tekrar kaydet. days_ago: öğünler GEÇMİŞ bir güne aitse (dün=1, evvelsi
        gün=2, en fazla 7); bugün için boş bırak."""
        log_date = resolve_log_date(db, user_id, days_ago, expected_days_ago)
        if isinstance(log_date, str):
            return log_date
        # İsimden BAĞIMSIZ tekrar kontrolü (bkz. yukarıdaki
        # _seen_meal_call_fingerprints yorumu) - bu çağrının TÜM
        # besinlerinin sayısal içeriği (miktar, öğün türü) bu turda daha
        # önce görülen bir çağrıyla birebir aynıysa, isimler ne olursa
        # olsun TAMAMEN atla. Besin isim çözümlemesinden ÖNCE yapılıyor ki
        # yanlış/halüsinasyonlu isimler hiç DB'ye yazılmasın.
        meal_call_fingerprint = tuple(
            sorted(((item.quantity_grams, item.meal_type) for item in meals), key=str)
        )
        if meal_call_fingerprint and log_date != _today:
            meal_call_fingerprint = (log_date.isoformat(), *meal_call_fingerprint)
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
        resolved_matches: list[tuple[FoodCatalog | None, float]] = []
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

        key_by_index = {idx: key for key, idxs in indices_by_key.items() for idx in idxs}
        skip_indices: set[int] = set()
        skipped_repeats: list[str] = []
        for key in order:
            idxs = indices_by_key[key]
            items_tuples = [(meals[i].quantity_grams, meals[i].meal_type) for i in idxs]
            if _dedup_guard.is_repeat(_dedup_name(dedup_name_by_key[key], log_date), items_tuples):
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
                    log_date=log_date,
                    language=_language,
                )
            except ValueError as exc:
                skipped.append(f"'{item.food_name}': {exc}")
                continue
            # Tekrar koruması yalnız başarılı kayıttan sonra (bkz. TurnDedupGuard.is_repeat).
            _dedup_guard.seed(_dedup_name(dedup_name_by_key[key_by_index[idx]], log_date), [(item.quantity_grams, item.meal_type)])

            logged.append(
                f"{entry.food_name_snapshot} ({entry.quantity_grams:.0f}g, {entry.meal_type}, "
                f"{entry.calories_kcal:.0f} kalori)"
            )

        parts = []
        if logged:
            parts.append(
                f"{len(logged)} öğün kaydedildi: " + "; ".join(logged) + "." + past_date_note(log_date, _today)
            )
        if skipped:
            parts.append("Kaydedilemeyenler: " + "; ".join(skipped) + ".")
        if not logged:
            # Hiçbiri yazılmadıysa başarısız sayılsın (bkz. log_meal'deki not).
            return "Kaydedilmedi: " + (" ".join(parts) if parts else "hiçbir besin kaydedilmedi.")
        return " ".join(parts)

    @tool
    def get_daily_nutrition_summary() -> str:
        """Kullanıcının bugünkü toplam kalori/protein/karbonhidrat/yağ alımının
        özetini döndürür (kullanıcı günlük hedef belirlediyse karşılaştırma
        yüzdesiyle birlikte). Kullanıcı 'bugün ne kadar kalori aldım' gibi bir
        şey sorduğunda bu aracı çağır."""
        return nutrition_log_service.generate_daily_nutrition_summary(db, user_id).as_text()

    return [search_food_catalog, log_meal, log_meals_bulk, get_daily_nutrition_summary]
