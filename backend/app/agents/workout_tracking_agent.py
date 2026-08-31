from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.agents.turn_dedup import TurnDedupGuard
from app.services import exercise_catalog_service, exercise_goal_service, profile_service, workout_service
from app.services.fuzzy_match import tr_lower


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
    reps: int | None = Field(
        default=None,
        description=(
            "Tekrar sayısı. SÜRE BAZLI bir aktivite (koşu/bisiklet/yürüyüş/"
            "yüzme/ip atlama/esneklik gibi tekrar sayısı olmayan bir kardiyo "
            "hareketi) ise BUNU BOŞ bırak, bunun yerine duration_minutes "
            "[+intensity+cardio_category] doldur — reps VE duration_minutes "
            "AYNI ANDA doldurulmaz (biri ya da diğeri, ikisi birden değil)."
        ),
    )
    weight_kg: float | None = Field(
        default=None, description="Kullanılan ağırlık (kg); belirtilmemişse boş bırak"
    )
    duration_minutes: float | None = Field(
        default=None,
        description=(
            "SADECE süre bazlı bir kardiyo/esneklik aktivitesi için (ör. "
            "'25 dakika koşu bandında koştum', '30 dk yürüyüş yaptım', "
            "'40 dakika yüzdüm') — dakika cinsinden süre. Bu doluysa reps VE "
            "weight_kg BOŞ bırakılır, bunun yerine intensity VE "
            "cardio_category de MUTLAKA doldurulmalı (ikisi de zorunlu, "
            "eksik bırakılamaz). Canlı testte bulundu (2026-08-31): bu alan "
            "eklenmeden önce sohbet ajanı süre bazlı bir aktiviteyi HİÇBİR "
            "ŞEKİLDE kaydedemiyordu, sessizce atlayıp yine de başarı iddia "
            "edebiliyordu — kullanıcı ne söylerse söylesin süre bazlı bir "
            "aktivite anlatıldığında bu üç alan (duration_minutes, "
            "intensity, cardio_category) MUTLAKA kullanılmalı, asla "
            "atlanmamalı."
        ),
    )
    intensity: str | None = Field(
        default=None,
        description=(
            "duration_minutes doluyken ZORUNLU, aksi halde boş bırak. Şu "
            "üçünden biri: 'hafif', 'orta', 'yogun'. Kullanıcı belirtmediyse "
            "'orta' varsay."
        ),
    )
    cardio_category: str | None = Field(
        default=None,
        description=(
            "duration_minutes doluyken ZORUNLU, aksi halde boş bırak. Şu "
            "kategorilerden biri: 'kosu' (koşu/koşu bandı), 'bisiklet', "
            "'yuruyus' (yürüyüş), 'yuzme', 'ip_atlama', 'esneklik' (germe/"
            "yoga/mobilite), yukarıdakilerden hiçbiri net uymuyorsa "
            "'genel_kardiyo'."
        ),
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
            "'peck deck 3x10 65kg' → TEK ağırlık, set_count=3 DOĞRU).\n\n"
            "AYRI KRİTİK UYARI — AYNI cümlede bir egzersiz için İKİ AYRI GRUP "
            "art arda gelebilir (önce tekrarlı bir grup, sonra tek başına "
            "farklı bir set): 'ön omuz için 12kg ile 3x10, sonrasında 15kg "
            "ile 8 tekrar attım' — bu İKİ AYRI grup anlatıyor: (1) 12kg'de "
            "10 tekrarlık bir grup ki 3 KEZ tekrarlanmış (set_count=3), (2) "
            "15kg'de 8 tekrarlık TEK bir set (set_count=1). DOĞRU: İKİ eleman "
            "yaz — {reps:10, weight_kg:12, set_count:3} VE {reps:8, "
            "weight_kg:15, set_count:1} — TOPLAM 4 set. YANLIŞ: ikinci grubu "
            "atlamak ya da ilk grubun set_count'unu unutup 1 yazmak (bu "
            "sessizce set kaybeder, en sık görülen hata: '3x10' kısmı "
            "cümlenin ortasında kalınca gözden kaçıp tek sete düşüyor)."
        ),
    )


def build_workout_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    # Kullanıcının katalog görüntüleme dili (bkz. UserProfile.preferred_
    # language) — bu turda BİR KEZ okunup closure'da tutulur, egzersiz
    # kayıt/hedef araçlarının hepsi kanonik ismi (TR/EN) buna göre seçer.
    # Sohbetin GERİ KALANI (LLM'in ürettiği metin) bundan ETKİLENMEZ, sadece
    # katalogdan gelen kanonik isim seçimi (ayrı bir faz, bkz.
    # project_health_coach_status.md).
    _language = profile_service.get_language(db, user_id)

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
    #
    # nutrition_tracking_agent.py'de BİREBİR aynı mantık ayrıca yazılmıştı
    # (2026-08-10 mimari borç raporu, bulgu #4) - artık ortak TurnDedupGuard.
    _dedup_guard: TurnDedupGuard[tuple[int | None, float | None, float | None]] = TurnDedupGuard()
    # Guard'ı SADECE bu turla değil, BUGÜN DB'de zaten kayıtlı setlerle de
    # "seed" et - aksi halde konuşma geçmişinde duran önceki bir mesaj,
    # sonraki bir turda modelin TÜM eski antrenmanı ikinci kez loglamasına
    # yol açabiliyordu (canlı testte bulundu, 2026-08-31; bkz.
    # workout_service.list_today_sets_by_exercise docstring'i).
    for _key, _items in workout_service.list_today_sets_by_exercise(db, user_id).items():
        _dedup_guard.seed(_key, _items)

    # İSİMDEN BAĞIMSIZ, ikinci bir güvenlik ağı - canlı testte bulundu
    # (2026-08-31): model bazen TEK bir turda log_exercise_sets_bulk'u İKİ
    # KEZ çağırıp ikinci seferde egzersiz isimlerini HALÜSİNASYONLA FARKLI
    # üretiyordu (sayısal değerler birebir aynıyken isim farklı olduğu için
    # yukarıdaki isim-bazlı _dedup_guard bunu yakalayamıyordu - bkz.
    # workout_service.list_today_session_fingerprints docstring'i). Bugün
    # zaten var olan her oturumun "parmak izi" (sıralanmış reps/ağırlık/süre
    # çoklu-kümesi) burada seed ediliyor, her yeni bulk çağrının TAMAMI bu
    # kümeyle karşılaştırılıyor.
    _seen_fingerprints = workout_service.list_today_session_fingerprints(db, user_id)

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
        reps: int | None = None,
        weight_kg: float | None = None,
        workout_type: str | None = None,
        duration_minutes: float | None = None,
        intensity: str | None = None,
        cardio_category: str | None = None,
    ) -> str:
        """Kullanıcının yaptığı BİR seti (egzersiz adı, tekrar sayısı, opsiyonel
        ağırlık) YA DA süre bazlı TEK bir kardiyo/esneklik aktivitesini
        kaydeder. Kullanıcı AYNI mesajda birden fazla set/egzersiz/aktivite
        belirtirse (ör. '3x10 squat 60 kilo yaptım' gibi TEK egzersizin
        birden fazla seti, ya da birden fazla egzersiz) bu aracı tekrar tekrar
        ÇAĞIRMA — bunun yerine log_exercise_sets_bulk'u tüm setlerle TEK
        seferde çağır. Bu araç SADECE kullanıcının TEK bir set/aktivite
        anlattığı durumlar içindir. Aynı gün içindeki setler otomatik olarak
        aynı antrenman oturumuna eklenir, set numarası kendiliğinden artar.
        Bu genel bilgi sorularında kullanılan search_exercise_knowledge ile
        KARIŞTIRMA — bu araç somut bir antrenman KAYDI içindir. workout_type
        belirtilmişse (kuvvet/kardiyo/esneklik/karışık) ilet. exercise_name
        için: ExerciseSetItem.exercise_name'deki 'hareket türünü bağlamdan
        çıkarıp ekle' kuralı burada da geçerli.

        SÜRE BAZLI aktivite (ör. 'bugün 25 dakika koştum', '30 dk yürüdüm') —
        reps VE weight_kg'yi BOŞ bırak, bunun yerine duration_minutes
        [+intensity+cardio_category] doldur (bkz. ExerciseSetItem.
        duration_minutes/intensity/cardio_category ile AYNI kural - ikisi de
        duration_minutes doluyken ZORUNLU). Canlı testte bulundu
        (2026-08-31): bu alanlar eklenmeden önce sohbet ajanı süre bazlı bir
        aktiviteyi HİÇBİR ŞEKİLDE kaydedemiyordu, sessizce atlayıp yine de
        başarı iddia edebiliyordu."""
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
        canonical_name = exercise_catalog_service.canonical_name(
            match if catalog_id is not None else None, exercise_name, _language
        )

        # Dedup kontrolü KANONİK isimle yapılıyor, HAM `exercise_name`
        # DEĞİL - guard'ın "bugün DB'de zaten var" seed'i DB'deki kanonik
        # snapshot isimlerinden okunuyor (bkz. log_exercise_sets_bulk'taki
        # aynı gerekçe, canlı testte bulundu 2026-08-31); ham metin ancak
        # canonical_name çözümlendikten SONRA karşılaştırılırsa turlar arası
        # tutarlı çalışır.
        if _dedup_guard.is_exact_repeat(canonical_name, [(reps, weight_kg, duration_minutes)]):
            return (
                f"'{canonical_name}' için bu tam seti zaten kaydettin, tekrar "
                "kaydetmedim — aynı egzersizi ikinci kez loglama."
            )

        try:
            workout_set = workout_service.log_single_set(
                db,
                user_id,
                exercise_name=canonical_name,
                reps=reps,
                weight_kg=weight_kg,
                exercise_catalog_id=catalog_id,
                workout_type=workout_type,
                duration_minutes=duration_minutes,
                intensity=intensity,
                cardio_category=cardio_category,
            )
        except ValueError as exc:
            return str(exc)

        if workout_set.duration_minutes is not None:
            calorie_note = (
                f", ~{workout_set.estimated_calories:.0f} kalori" if workout_set.estimated_calories else ""
            )
            return (
                f"Kaydedildi: {workout_set.exercise_name_snapshot}, {workout_set.duration_minutes:.0f} "
                f"dakika{calorie_note}."
            )

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

        AYRI KRİTİK UYARI (drop-set'e özel undercounting hatası): set_count
        HER ZAMAN 'Nx' önekindeki N'DİR — listelenen ağırlık SAYISI DEĞİL.
        Yukarıdaki örnekte 3 ağırlık (12kg,10kg,7kg) sayılıyor ama set_count
        YİNE DE 4 olmalı ('4x20' önekinden). YANLIŞ: ağırlık sayısını (3)
        görüp 3 AYRI eleman yazmak (her biri set_count=1 varsayılanla) — bu,
        'Nx' önekindeki gerçek toplam seti (4) sessizce 3'e düşürür, bir set
        tamamen kaybolur. Ağırlık listesinin uzunluğu ile 'Nx' önekindeki N
        FARKLI sayılar olabilir (drop-set'te her zaman N > ağırlık sayısı
        beklenir) — ikisini karıştırma, set_count her zaman N'i taşımalı.

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
                ExerciseSetItem(
                    exercise_name=item.exercise_name,
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    duration_minutes=item.duration_minutes,
                    intensity=item.intensity,
                    cardio_category=item.cardio_category,
                )
                for _ in range(count)
            )
        sets = expanded

        # İsimden BAĞIMSIZ tekrar kontrolü (bkz. yukarıdaki _seen_fingerprints
        # yorumu) - bu çağrının TÜM setlerinin sayısal içeriği bugün zaten
        # var olan bir oturumla birebir aynıysa, isimler ne olursa olsun
        # TAMAMEN atla. Egzersiz isim çözümlemesinden ÖNCE yapılıyor ki
        # yanlış/halüsinasyonlu isimler hiç DB'ye yazılmasın.
        # key=str - bkz. workout_service.list_today_session_fingerprints'teki
        # aynı gerekçe (None ile int/float karşılaştırması TypeError verir).
        call_fingerprint = tuple(
            sorted(((item.reps, item.weight_kg, item.duration_minutes) for item in sets), key=str)
        )
        if call_fingerprint and call_fingerprint in _seen_fingerprints:
            return (
                "Bu setlerin TAMAMI (aynı tekrar/ağırlık/süre kombinasyonuyla) zaten "
                "kaydedilmiş görünüyor, tekrar kaydetmedim - muhtemelen aynı antrenmanı "
                "farklı bir ifadeyle ikinci kez anlatıyorsun."
            )
        if call_fingerprint:
            # Bu turda AYNI çağrının üçüncü kez tekrarlanmasına karşı da
            # (nadir ama olabilir) hemen kaydediliyor - başarılı DB
            # commit'ini beklemeye gerek yok, TurnDedupGuard.is_exact_repeat
            # ile AYNI ilke (ilk görüldüğünde işaretle).
            _seen_fingerprints.add(call_fingerprint)

        # Kanonik ismi (varsa katalog eşleşmesi) HER eleman için önceden
        # çözümle - dedup gruplaması buna göre yapılacak, HAM LLM metnine
        # göre DEĞİL (bkz. aşağıdaki not). Eşleşme varsa DB'deki kanonik
        # isimle kaydet (bkz. log_exercise_set'teki aynı gerekçe) — LLM'in
        # yazdığı isim SADECE eşleşme yoksa kullanılır.
        resolved_items: list[tuple[str, int | None]] = []  # (canonical_name, catalog_id)
        for item in sets:
            match, score = exercise_catalog_service.best_match(db, item.exercise_name)
            catalog_id = (
                match.id
                if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD
                else None
            )
            canonical_name = exercise_catalog_service.canonical_name(
                match if catalog_id is not None else None, item.exercise_name, _language
            )
            resolved_items.append((canonical_name, catalog_id))

        # KANONİK isme göre grupla (bkz. _dedup_guard) — her egzersizin bu
        # çağrıdaki TÜM setleri, o egzersiz için DAHA ÖNCE (bu turda VEYA
        # bugün DB'de) kaydedilenle birebir aynıysa TAMAMI atlanır (uzun
        # mesajlarda modelin aynı egzersizi ikinci kez loglaması engellenir).
        # HAM LLM metni (item.exercise_name) DEĞİL kanonik isim kullanılıyor
        # çünkü guard'ın "bugün DB'de zaten var" seed'i (bkz. yukarısı)
        # DB'deki kanonik snapshot isimlerinden okunuyor - LLM aynı egzersizi
        # farklı bir ham ifadeyle yazarsa (ör. "shoulder press" / "omuz
        # presi") ham metin bazlı gruplama bu iki turu hiç eşleştiremezdi
        # (canlı testte bulundu, 2026-08-31). Aynı çağrı İÇİNDEKİ meşru
        # tekrarlar (set_count veya elle kopyalanan özdeş elemanlar) bundan
        # etkilenmez, sadece SONRAKİ bir tekrar çağrı engellenir.
        order: list[str] = []
        indices_by_key: dict[str, list[int]] = {}
        for idx, (canonical_name, _catalog_id) in enumerate(resolved_items):
            key = tr_lower(canonical_name.strip())
            indices_by_key.setdefault(key, []).append(idx)
            if key not in order:
                order.append(key)

        skip_indices: set[int] = set()
        skipped_exercises: list[str] = []
        for key in order:
            idxs = indices_by_key[key]
            items_tuples = [(sets[i].reps, sets[i].weight_kg, sets[i].duration_minutes) for i in idxs]
            canonical_name_for_group = resolved_items[idxs[0]][0]
            if _dedup_guard.is_exact_repeat(canonical_name_for_group, items_tuples):
                skip_indices.update(idxs)
                skipped_exercises.append(canonical_name_for_group)

        resolved_sets = []
        for idx, item in enumerate(sets):
            if idx in skip_indices:
                continue
            canonical_name, catalog_id = resolved_items[idx]
            resolved_sets.append(
                workout_service.SetInput(
                    exercise_name=canonical_name,
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    exercise_catalog_id=catalog_id,
                    duration_minutes=item.duration_minutes,
                    intensity=item.intensity,
                    cardio_category=item.cardio_category,
                )
            )

        if not resolved_sets:
            return (
                "Bu egzersiz(ler)i ("
                + ", ".join(skipped_exercises)
                + ") zaten kaydettim, tekrar kaydetmedim."
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
                " (" + ", ".join(skipped_exercises) + " zaten kaydedilmişti, "
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
        canonical_name = exercise_catalog_service.canonical_name(
            match if catalog_id is not None else None, exercise_name, _language
        )
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
            # 2026-08-27: bu araç şu an SADECE ağırlık hedefi OLUŞTURABİLİYOR
            # (set_exercise_goal'ın imzası hâlâ target_weight_kg-only, bkz.
            # yukarısı), ama LİSTELEME mobil/web'de girilmiş süre (kardiyo) ya
            # da tekrar alt-hedefli kayıtları da döndürebilir - buradaki metin
            # üretimi o durumlarda da doğru olmalı (aksi halde "hedef None kg"
            # gibi anlamsız bir cümle LLM'e bağlam olarak gidiyordu).
            if item.target_duration_minutes is not None:
                best = f"{item.best_duration_minutes:.0f} dk" if item.best_duration_minutes is not None else "henüz kayıt yok"
                parts.append(
                    f"{item.exercise_name}: hedef {item.target_duration_minutes:.0f} dk, en iyi {best} (%{item.progress_pct:.0f})"
                )
                continue
            best = f"{item.best_weight_kg} kg" if item.best_weight_kg is not None else "henüz kayıt yok"
            rep_suffix = f", {item.target_reps} tekrar" if item.target_reps is not None else ""
            parts.append(
                f"{item.exercise_name}: hedef {item.target_weight_kg} kg{rep_suffix}, en iyi {best} (%{item.progress_pct:.0f})"
            )
        return "; ".join(parts)

    return [
        search_exercise_catalog,
        log_exercise_set,
        log_exercise_sets_bulk,
        get_workout_summary,
        set_exercise_goal,
        get_exercise_goals,
    ]
