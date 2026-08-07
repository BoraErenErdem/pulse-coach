from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.services import exercise_catalog_service, exercise_goal_service, workout_service


class ExerciseSetItem(BaseModel):
    exercise_name: str = Field(
        description=(
            "Egzersiz adı, ör. 'Shoulder Press'. KRİTİK — kullanıcı sadece kas "
            "grubunu söyleyip HAREKET TÜRÜNÜ (kaldırma/pres/itme/çekme/curl/fly) "
            "belirtmezse (ör. 'arka omuz için 3x10 sırasıyla 55, 60, 65kg "
            "yaptım'), buraya SADECE kas grubunu yazma — mesajın bağlamından "
            "(aynı mesajdaki komşu egzersizlerden, ör. az önce 'lateral raise' "
            "ve 'front raise' anlatılmışsa bu bir 'kaldırma/raise' serisinin "
            "devamıdır) hareket türünü çıkarıp exercise_name'e EKLE (ör. 'arka "
            "omuz' değil 'arka omuz kaldırma'/'rear delt raise'). Bağlamdan "
            "çıkarım yapılamıyorsa (izole, tek başına bir kas grubu ismi) en "
            "yaygın/varsayılan hareketi varsay (ör. sadece 'biceps' → 'biceps "
            "curl'). Canlı testte bulundu (2026-08-07): salt kas grubu ismiyle "
            "('arka omuz') katalog araması yanlış TÜRDE bir harekete (rear delt "
            "RAISE yerine behind-the-neck PRESS) eşleşebiliyor çünkü ikisi de "
            "'arka'+'omuz' kelimelerini içeriyor — hareket türü kelimesi bu "
            "belirsizliği ortadan kaldırıyor."
        )
    )
    reps: int = Field(description="Tekrar sayısı")
    weight_kg: float | None = Field(
        default=None, description="Kullanılan ağırlık (kg); belirtilmemişse boş bırak"
    )
    set_count: int = Field(
        default=1,
        description=(
            "Bu TAM reps/weight_kg kombinasyonuyla kaç AYRI set yapıldığı. "
            "SADECE kullanıcı '4x12 50kg' ya da '3 set 10 tekrar 60 kilo' gibi "
            "AYNI ağırlık/tekrarın birden çok kez tekrarlandığını belirtirse "
            "kullan — o durumda listeye aynı elemanı N kez KOPYALAYARAK YAZMAK "
            "YERİNE tek bir elemanla ve set_count=N belirt.\n\n"
            "KRİTİK UYARI — set_count 'toplam kaç set yapıldığı' ile "
            "KARIŞTIRILMAMALI: kullanıcı 'squat 4 set sırasıyla 100kg 10 tekrar, "
            "110kg 8 tekrar, 120kg 6 tekrar, 130kg 2 tekrar' derse bu 4 FARKLI "
            "reps/ağırlık kombinasyonudur — her biri set_count=1 (varsayılan) "
            "ile AYRI bir eleman olmalı. YANLIŞ: bu 4 elemanın HER BİRİNE "
            "set_count=4 verip listeyi 16 elemana çıkarmak (mesajdaki '4 set' "
            "sayısını görüp otomatik olarak her elemanı o sayıyla çarpmak) — bu "
            "ciddi bir veri hatası, ağırlık hacmini yanlış şişirir. set_count'u "
            "SADECE tek bir elemanın kendisi N kez AYNEN tekrarlanıyorsa "
            "kullan, farklı reps/ağırlıklı elemanlarda HER ZAMAN 1 (varsayılan) "
            "bırak.\n\n"
            "AYRI KRİTİK UYARI — 'Nx10 sırasıyla A, B, C' kalıbı (çarpım "
            "öneki + 'sırasıyla' + virgüllü FARKLI değer listesi): kullanıcı "
            "'arka omuz için 3x10 sırasıyla 55kg, 60kg ve 65kg yaptım' derse "
            "'sırasıyla'dan sonra TAM OLARAK N (=3) adet FARKLI ağırlık "
            "sayılıyor — bu 3 FARKLI settir, 'Nx' önekindeki N'i set_count "
            "SANMA. DOĞRU: 3 AYRI eleman yaz (her biri reps=10, ağırlıkları "
            "sırasıyla 55/60/65), HER birinde set_count=1 (varsayılan). "
            "YANLIŞ: bu 3 elemanın HER BİRİNE set_count=3 verip listeyi 9 "
            "sete çıkarmak (aynı '4 set sırasıyla farklı ağırlık' hatasının "
            "'Nx' önekiyle yazılmış hâli — matematik aynı: N farklı eleman × "
            "yanlışlıkla set_count=N). set_count SADECE 'sırasıyla' YOKKEN ya "
            "da 'sırasıyla'dan sonra TEK bir değer varken kullanılır (ör. "
            "'peck deck 3x10 65kg' → TEK ağırlık, set_count=3 DOĞRU)."
        ),
    )


def build_workout_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    # Bu turdaki (TEK bir run_orchestrator çağrısı — bu fonksiyon her chat
    # isteğinde yeniden çağrılıp yeni bir closure kurduğu için sonraki
    # mesajlara SIZMAZ) egzersiz başına loglanan (reps, weight_kg) listesini
    # tutar. Canlı testte yakalandı (2026-08-05): çok sayıda egzersiz içeren
    # uzun bir mesajda model bazen AYNI egzersizin AYNI setlerini birkaç
    # saniye/on saniye arayla İKİNCİ KEZ log'luyordu (muhtemelen uzun
    # tool-call zincirinde kendi önceki çıktısını "unutup" tekrar üretmesi).
    # Burada bir egzersiz için gelen set listesi, o egzersiz için bu turda
    # daha önce kaydedilenle BİREBİR aynıysa (aynı sırada aynı reps/ağırlık)
    # sessizce atlanır — modelin prompt talimatına güvenmek yerine
    # deterministik bir güvenlik ağı. Farklı egzersizler ya da GERÇEKTEN
    # farklı set değerleri (ör. ek bir egzersiz unutulup sonradan eklendi)
    # bundan etkilenmez, sadece BİREBİR tekrar engellenir.
    _turn_logged: dict[str, list[tuple[int, float | None]]] = {}

    def _is_exact_repeat(exercise_name: str, items: list[tuple[int, float | None]]) -> bool:
        key = exercise_name.strip().lower()
        prior = _turn_logged.get(key, [])
        if items and prior[-len(items):] == items:
            return True
        _turn_logged[key] = prior + items
        return False

    @tool
    def search_exercise_catalog(query: str) -> str:
        """Egzersiz kataloğunda isimle arama yapar, en yakın eşleşen adayları
        Türkçe isimleriyle listeler. Arama hem Türkçe hem İngilizce isim
        üzerinden çalışır (ör. kullanıcı "dumbbell shoulder press" de yazsa
        "dambıl omuz presi" de yazsa aynı egzersiz bulunur). Kullanıcının
        söylediği egzersiz adı kataloğa net eşleşmiyorsa (log_exercise_set
        belirsiz adaylar döndürdüğünde) veya kullanıcı doğrudan bir egzersiz
        aramak istediğinde bu aracı çağır."""
        results = exercise_catalog_service.search_exercises(db, query)
        if not results:
            return "Katalogda bu aramaya uyan bir egzersiz bulunamadı."
        return "Bulunan egzersizler: " + ", ".join(row.name_tr for row in results)

    @tool
    def log_exercise_set(
        exercise_name: str,
        reps: int,
        weight_kg: float | None = None,
        workout_type: str | None = None,
    ) -> str:
        """Kullanıcının yaptığı BİR seti (egzersiz adı, tekrar sayısı, opsiyonel
        ağırlık) kaydeder. Kullanıcı AYNI mesajda birden fazla set/egzersiz
        belirtirse (ör. '3x10 squat 60 kilo yaptım' gibi TEK egzersizin
        birden fazla seti, ya da birden fazla egzersiz) bu aracı tekrar tekrar
        ÇAĞIRMA — bunun yerine log_exercise_sets_bulk'u tüm setlerle TEK
        seferde çağır. Bu araç SADECE kullanıcının TEK bir set anlattığı
        durumlar içindir. Aynı gün içindeki setler otomatik olarak aynı
        antrenman oturumuna eklenir, set numarası kendiliğinden artar. Bu
        genel bilgi sorularında kullanılan
        search_exercise_knowledge ile KARIŞTIRMA — bu araç somut bir antrenman
        KAYDI içindir. workout_type belirtilmişse (kuvvet/kardiyo/esneklik/
        karışık) ilet. exercise_name için: ExerciseSetItem.exercise_name'deki
        'hareket türünü bağlamdan çıkarıp ekle' kuralı burada da geçerli."""
        if _is_exact_repeat(exercise_name, [(reps, weight_kg)]):
            return (
                f"'{exercise_name}' için bu tam seti (bu turda) zaten kaydettin, tekrar "
                "kaydetmedim — aynı egzersizi ikinci kez loglama."
            )

        match, score = exercise_catalog_service.best_match(db, exercise_name)
        catalog_id = (
            match.id if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD else None
        )

        if catalog_id is None:
            candidates = exercise_catalog_service.search_exercises(db, exercise_name, limit=3)
            if candidates:
                names = ", ".join(candidate.name_tr for candidate in candidates)
                return (
                    f"'{exercise_name}' katalogda net olarak bulunamadı. Kullanıcıya şunlardan "
                    f"birini mi kastettiğini sor: {names}. Netleşince tekrar çağır."
                )
            # Katalogda hiç yakın eşleşme yok; yine de kullanıcının verdiği isimle kaydet.

        # Eşleşme varsa DB'DEKİ kanonik isimle kaydet, LLM'in ürettiği/çevirdiği
        # ham metinle DEĞİL — aksi halde aynı egzersiz farklı ifadelerle
        # (ör. "lat pulldown" vs kataloğun "Geniş Tutuş Aşağı Lat Çekiş"i)
        # farklı isimlerde birikip grafik/istatistiklerde ayrı, anormal
        # kalemler olarak görünüyordu (canlı testte bulundu, 2026-08-07).
        canonical_name = match.name_tr if catalog_id is not None else exercise_name

        try:
            workout_set = workout_service.log_single_set(
                db,
                user_id,
                exercise_name=canonical_name,
                reps=reps,
                weight_kg=weight_kg,
                exercise_catalog_id=catalog_id,
                workout_type=workout_type,
            )
        except ValueError as exc:
            return str(exc)

        return (
            f"Kaydedildi: {workout_set.exercise_name_snapshot}, set {workout_set.set_number}, "
            f"{workout_set.reps} tekrar"
            + (f", {workout_set.weight_kg} kg" if workout_set.weight_kg else "")
            + "."
            + (
                " Bu, kullanıcının bu egzersizdeki YENİ KİŞİSEL REKORU! Yanıtında bunu"
                " coşkuyla ama abartısız kutla."
                if workout_set.is_personal_record
                else ""
            )
        )

    @tool
    def log_exercise_sets_bulk(
        sets: list[ExerciseSetItem], workout_type: str | None = None
    ) -> str:
        """Kullanıcının TEK mesajda anlattığı BİRDEN FAZLA seti (2 veya daha
        fazla, aynı egzersizden ya da farklı egzersizlerden) TEK seferde
        kaydeder. Kullanıcı bir antrenmanın tamamını ya da birden çok seti
        tek mesajda anlatıyorsa (ör. 'shoulder press 70kg 8, 75kg 7, sonra
        lateral raise 12kg 4 set 10 tekrar...') log_exercise_set'i HER set
        için tek tek çağırmak YERİNE bu aracı TERCİH ET: tüm setleri TEK bir
        listeyle, TEK çağrıda ilet — bu, çok sayıda ayrı çağrıya göre çok
        daha güvenilir çalışır. Kullanıcı sadece TEK bir set anlatıyorsa
        (ör. '60 kilo 10 tekrar squat yaptım') log_exercise_set'i kullan.

        KRİTİK — AYNI ağırlık/tekrarın birden çok kez tekrarlandığı durumlar
        (ör. '3 set 10 tekrar 60 kilo bench press', '4x12 50kg ile kalf
        yaptım') için `set_count` alanını kullan: TEK bir eleman yaz, o
        elemanın set_count'unu tekrar sayısına eşitle. Örnek: '3 set 10
        tekrar 60kg bench press' →
        sets=[{"exercise_name":"bench press","reps":10,"weight_kg":60,"set_count":3}].
        '4x12 50kg ile kalf yaptım' →
        sets=[{"exercise_name":"kalf makinesi","reps":12,"weight_kg":50,"set_count":4}].
        AYNI elemanı elle N kez kopyalayıp listeye ekleme — bu daha
        hataya açık, set_count kullan. Farklı setlerde tekrar/ağırlık
        değişiyorsa (ör. '8x70kg, 7x75kg') her biri zaten doğal olarak ayrı
        bir eleman, hepsinde set_count=1 (varsayılan) kalır.

        KRİTİK — 'Nx10 sırasıyla A, B, C' kalıbı set_count'la KARIŞTIRILMAZ:
        '3x10 sırasıyla 55kg, 60kg, 65kg' 3 FARKLI settir (N=3 değer
        sayılıyor), 'Nx' önekindeki 3'ü set_count sanma. DOĞRU: sets=[
        {"exercise_name":"...","reps":10,"weight_kg":55},
        {"exercise_name":"...","reps":10,"weight_kg":60},
        {"exercise_name":"...","reps":10,"weight_kg":65}] (üçünde de
        set_count=1, varsayılan). YANLIŞ: üç elemanın da set_count=3
        yapılıp 9 sete çıkarılması. 'sırasıyla'dan sonra TEK değer varsa
        (ör. 'peck deck 3x10 65kg') bu farklı bir durum, orada set_count=3
        DOĞRU kullanımdır (yukarıdaki '4x12 50kg' örneğiyle aynı kalıp).

        KRİTİK — 'Nx[tekrar] A, B, C ile drop yaptım' kalıbı (drop set):
        yukarıdaki 'sırasıyla' kuralıyla KARIŞTIRILMAZ, farklı bir anlamı
        var. 'lateral için 4x20 12kg, 10kg ve 7kg ile drop yaptım' burada
        kullanıcı TOPLAM 4 set yapmıştır (her seti aynı 3 ağırlık arasında
        ağırlık düşürerek/drop tekniğiyle tamamlamıştır) — 4x3=12 set OLARAK
        YORUMLAMA (bu ciddi bir aşırı sayım hatası). DOĞRU: TEK eleman,
        set_count='Nx' önekindeki N (burada 4), weight_kg=listedeki İLK/EN
        AĞIR değer (drop set en ağırdan başlar): sets=[{"exercise_name":
        "lateral raise","reps":20,"weight_kg":12,"set_count":4}]. (Şemanın
        tek ağırlık alanı tam drop-set detayını — setin ortasında ağırlığın
        düşmesini — kaydedemiyor, bu bilinen bir sınırlama; en ağır/başlangıç
        ağırlığı temsilci değer olarak kullanılıyor.) Ayırt edici işaret:
        'sırasıyla' YOK, bunun yerine 'drop' kelimesi VAR.

        Bu aracı bir egzersiz için TEK bir turda BİR KEZ çağır — aynı
        egzersizi ikinci kez (aynı ya da başka bir çağrıda) tekrar loglama;
        zaten kaydedilmiş bir egzersiz otomatik olarak atlanır ama yine de
        gereksiz bir çağrı olur.

        Setler aynı antrenman oturumuna eklenir, egzersiz başına set numarası
        kendiliğinden artar. Egzersiz katalogda net eşleşmese bile kullanıcının
        verdiği isimle kaydedilir (tek tek onay beklemek burada veri
        kaybından daha kötü bir sonuç olur)."""
        # Her elemanı set_count kadar birim sete AÇ (ör. set_count=4 → 4 ayrı
        # (exercise_name, reps, weight_kg) birimi) — model artık aynı seti N
        # kez elle kopyalamak zorunda değil, sadece bir sayı yazıyor. Canlı
        # testte (2026-08-05) tam bu "aynı değeri N kez kopyala" adımında
        # model bazen tek elemana sıkışıp set kaybediyordu (bkz.
        # feedback_llm_tuning_health_coach.md); set_count bu riski ortadan
        # kaldırıyor çünkü tekrar eden JSON metni üretmeyi gerektirmiyor.
        expanded: list[ExerciseSetItem] = []
        for item in sets:
            count = max(1, item.set_count)
            expanded.extend(
                ExerciseSetItem(exercise_name=item.exercise_name, reps=item.reps, weight_kg=item.weight_kg)
                for _ in range(count)
            )
        sets = expanded

        # Egzersiz adına göre grupla (bkz. _is_exact_repeat) — her egzersizin
        # bu çağrıdaki TÜM setleri, o egzersiz için bu turda daha önce
        # kaydedilenle birebir aynıysa TAMAMI atlanır (uzun mesajlarda
        # modelin aynı egzersizi ikinci kez loglaması engellenir). Aynı
        # çağrı İÇİNDEKİ meşru tekrarlar (set_count veya elle kopyalanan
        # özdeş elemanlar) bundan etkilenmez, sadece SONRAKİ bir tekrar
        # çağrı engellenir.
        order: list[str] = []
        indices_by_key: dict[str, list[int]] = {}
        for idx, item in enumerate(sets):
            key = item.exercise_name.strip().lower()
            indices_by_key.setdefault(key, []).append(idx)
            if key not in order:
                order.append(key)

        skip_indices: set[int] = set()
        skipped_exercises: list[str] = []
        for key in order:
            idxs = indices_by_key[key]
            items_tuples = [(sets[i].reps, sets[i].weight_kg) for i in idxs]
            if _is_exact_repeat(sets[idxs[0]].exercise_name, items_tuples):
                skip_indices.update(idxs)
                skipped_exercises.append(sets[idxs[0]].exercise_name)

        resolved_sets = []
        for idx, item in enumerate(sets):
            if idx in skip_indices:
                continue
            match, score = exercise_catalog_service.best_match(db, item.exercise_name)
            catalog_id = (
                match.id
                if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD
                else None
            )
            # Eşleşme varsa DB'deki kanonik isimle kaydet (bkz. log_exercise_set'teki
            # aynı gerekçe) — LLM'in yazdığı isim SADECE eşleşme yoksa kullanılır.
            canonical_name = match.name_tr if catalog_id is not None else item.exercise_name
            resolved_sets.append(
                workout_service.SetInput(
                    exercise_name=canonical_name,
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    exercise_catalog_id=catalog_id,
                )
            )

        if not resolved_sets:
            return (
                "Bu egzersiz(ler)i ("
                + ", ".join(skipped_exercises)
                + ") bu turda zaten kaydettim, tekrar kaydetmedim."
            )

        try:
            session = workout_service.log_workout_session(
                db, user_id, sets=resolved_sets, workout_type=workout_type
            )
        except ValueError as exc:
            return str(exc)

        per_exercise: dict[str, int] = {}
        new_records: list[str] = []
        for workout_set in session.sets:
            per_exercise[workout_set.exercise_name_snapshot] = (
                per_exercise.get(workout_set.exercise_name_snapshot, 0) + 1
            )
            if workout_set.is_personal_record:
                detail = f"{workout_set.reps} tekrar" + (
                    f", {workout_set.weight_kg} kg" if workout_set.weight_kg else ""
                )
                new_records.append(f"{workout_set.exercise_name_snapshot} ({detail})")
        breakdown = ", ".join(f"{name}: {count} set" for name, count in per_exercise.items())
        result = f"{len(session.sets)} set kaydedildi ({breakdown})."
        if skipped_exercises:
            result += (
                " (" + ", ".join(skipped_exercises) + " bu turda zaten kaydedilmişti, "
                "tekrar kaydedilmedi.)"
            )
        if new_records:
            result += (
                " YENİ KİŞİSEL REKOR(LAR): " + "; ".join(new_records)
                + ". Yanıtında bunları coşkuyla ama abartısız kutla."
            )
        return result

    @tool
    def get_workout_summary(days: int = 7) -> str:
        """Kullanıcının son `days` gündeki (varsayılan 7) detaylı antrenman
        özetini (set sayısı, hacim, en çok çalışılan egzersizler) döndürür.
        Kullanıcı 'bu hafta hangi egzersizleri yaptım' gibi bir şey sorduğunda
        bu aracı çağır."""
        return workout_service.generate_workout_summary(db, user_id, days=days).as_text()

    @tool
    def set_exercise_goal(exercise_name: str, target_weight_kg: float) -> str:
        """Kullanıcının belirli bir egzersizde ulaşmak istediği ağırlık
        hedefini kaydeder (ör. 'squat'ta 100 kiloya ulaşmak istiyorum' →
        exercise_name='squat', target_weight_kg=100). Aynı egzersiz için
        tekrar çağrılırsa hedef günceller. Kullanıcının antrenman geçmişindeki
        en iyi kaydıyla otomatik karşılaştırılıp ilerleme takip edilir."""
        match, score = exercise_catalog_service.best_match(db, exercise_name)
        catalog_id = (
            match.id if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD else None
        )
        # Eşleşme varsa DB'deki kanonik isimle kaydet (bkz. log_exercise_set'teki
        # aynı gerekçe) — aksi halde aynı egzersiz için hedef ve gerçek antrenman
        # kaydı farklı isimlerde birikip ilerleme karşılaştırması bozulabilir.
        canonical_name = match.name_tr if catalog_id is not None else exercise_name
        try:
            goal = exercise_goal_service.set_exercise_goal(
                db, user_id, exercise_name=canonical_name, target_weight_kg=target_weight_kg, exercise_catalog_id=catalog_id
            )
        except ValueError as exc:
            return str(exc)
        return f"Hedef kaydedildi: {goal.exercise_name} — {goal.target_weight_kg} kg."

    @tool
    def get_exercise_goals() -> str:
        """Kullanıcının tüm egzersiz ağırlık hedeflerini ve mevcut
        ilerlemesini (antrenman geçmişindeki en iyi kayıtla karşılaştırmalı)
        döndürür. Kullanıcı 'hedeflerime ne kadar yaklaştım' gibi bir şey
        sorduğunda bu aracı çağır."""
        progress = exercise_goal_service.list_exercise_goal_progress(db, user_id)
        if not progress:
            return "Kullanıcının henüz kayıtlı bir egzersiz hedefi yok."
        parts = []
        for item in progress:
            best = f"{item.best_weight_kg} kg" if item.best_weight_kg is not None else "henüz kayıt yok"
            parts.append(f"{item.exercise_name}: hedef {item.target_weight_kg} kg, en iyi {best} (%{item.progress_pct:.0f})")
        return "; ".join(parts)

    return [
        search_exercise_catalog,
        log_exercise_set,
        log_exercise_sets_bulk,
        get_workout_summary,
        set_exercise_goal,
        get_exercise_goals,
    ]
