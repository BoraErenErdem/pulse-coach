from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.services import exercise_catalog_service, exercise_goal_service, workout_service


class ExerciseSetItem(BaseModel):
    exercise_name: str = Field(description="Egzersiz adı, ör. 'Shoulder Press'")
    reps: int = Field(description="Tekrar sayısı")
    weight_kg: float | None = Field(
        default=None, description="Kullanılan ağırlık (kg); belirtilmemişse boş bırak"
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
        karışık) ilet."""
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

        try:
            workout_set = workout_service.log_single_set(
                db,
                user_id,
                exercise_name=exercise_name,
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

        KRİTİK — 'N set' ifadesini AÇ: kullanıcı '3 set 10 tekrar 60 kilo
        bench press yaptım' derse bu TEK bir liste elemanı DEĞİL, AYNI
        egzersiz/tekrar/ağırlıkla TEKRARLANAN 3 AYRI elemandır — `sets`
        listesine bu üç seti üç kez (birbirinin kopyası) ekle, tek elemanlı
        bırakma. Örnek: '3 set 10 tekrar 60kg bench press' →
        sets=[{"exercise_name":"bench press","reps":10,"weight_kg":60},
        {"exercise_name":"bench press","reps":10,"weight_kg":60},
        {"exercise_name":"bench press","reps":10,"weight_kg":60}]. Farklı
        setlerde tekrar/ağırlık değişiyorsa (ör. '8x70kg, 7x75kg') her biri
        zaten doğal olarak ayrı bir eleman. AYNI kural '4x12 50kg' gibi tek
        ağırlıklı ifadeler için de geçerli: '4x12 50kg ile kalf yaptım' →
        4 tekrar sayısı (12) ve 4 ağırlık (50) demektir, sets listesine 4
        ÖZDEŞ eleman ekle — SAKIN "ağırlık hep aynı, tek eleman yeter" diye
        kısaltma, bu setleri eksik kaydettirir.

        Bu aracı bir egzersiz için TEK bir turda BİR KEZ çağır — aynı
        egzersizi ikinci kez (aynı ya da başka bir çağrıda) tekrar loglama;
        zaten kaydedilmiş bir egzersiz otomatik olarak atlanır ama yine de
        gereksiz bir çağrı olur.

        Setler aynı antrenman oturumuna eklenir, egzersiz başına set numarası
        kendiliğinden artar. Egzersiz katalogda net eşleşmese bile kullanıcının
        verdiği isimle kaydedilir (tek tek onay beklemek burada veri
        kaybından daha kötü bir sonuç olur)."""
        # Egzersiz adına göre grupla (bkz. _is_exact_repeat) — her egzersizin
        # bu çağrıdaki TÜM setleri, o egzersiz için bu turda daha önce
        # kaydedilenle birebir aynıysa TAMAMI atlanır (uzun mesajlarda
        # modelin aynı egzersizi ikinci kez loglaması engellenir). Aynı
        # çağrı İÇİNDEKİ meşru tekrarlar (ör. '4x12 50kg' → 4 özdeş eleman)
        # bundan etkilenmez, sadece SONRAKİ bir tekrar çağrı engellenir.
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
            resolved_sets.append(
                workout_service.SetInput(
                    exercise_name=item.exercise_name,
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
        try:
            goal = exercise_goal_service.set_exercise_goal(
                db, user_id, exercise_name=exercise_name, target_weight_kg=target_weight_kg, exercise_catalog_id=catalog_id
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
