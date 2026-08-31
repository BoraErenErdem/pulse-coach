import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.exercise_catalog import ExerciseCatalog
from app.services import exercise_catalog_service, fuzzy_match


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    catalog = [
        ExerciseCatalog(
            source_id="Barbell_Bench_Press",
            name_en="Barbell Bench Press",
            name_tr="Barbell Bench Press",
            category_tr="kuvvet",
            equipment_tr="barbell",
            primary_muscles_tr="göğüs",
            level_tr="orta",
        ),
        ExerciseCatalog(
            source_id="Squat",
            name_en="Squat",
            name_tr="Squat",
            category_tr="kuvvet",
            equipment_tr="barbell",
            primary_muscles_tr="ön bacak (quadriceps)",
            level_tr="orta",
        ),
        ExerciseCatalog(
            source_id="Push_Up",
            name_en="Push-Up",
            name_tr="Şınav",
            category_tr="kuvvet",
            equipment_tr="vücut ağırlığı",
            primary_muscles_tr="göğüs",
            level_tr="başlangıç",
        ),
        # Kısa, jenerik "... Hareketi" ekli bir kayıt - bkz.
        # test_best_match_ignores_generic_movement_filler_word.
        ExerciseCatalog(
            source_id="Skating",
            name_en="Skating",
            name_tr="Kayaklama Hareketi",
            category_tr="kardiyo",
            equipment_tr="yok",
            primary_muscles_tr="bacak",
            level_tr="orta",
        ),
        # "Makinesi" (iyelik eki) - bkz.
        # test_best_match_handles_makine_case_suffix_plus_extra_preposition.
        ExerciseCatalog(
            source_id="Pec_Deck_Fly",
            name_en="Pec Deck Fly",
            name_tr="Peck Deck Makinesi",
            category_tr="kuvvet",
            equipment_tr="makine",
            primary_muscles_tr="göğüs",
            level_tr="başlangıç",
        ),
    ]
    session.add_all(catalog)
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_search_exercises_finds_close_match(db_session):
    results = exercise_catalog_service.search_exercises(db_session, "bench press", limit=3)
    names = [row.name_tr for row in results]
    assert "Barbell Bench Press" in names


def test_search_exercises_returns_empty_list_when_catalog_empty():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    assert exercise_catalog_service.search_exercises(session, "squat") == []
    session.close()


def test_best_match_returns_high_score_for_exact_name(db_session):
    match, score = exercise_catalog_service.best_match(db_session, "Squat")
    assert match is not None
    assert match.name_tr == "Squat"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_returns_low_score_for_unrelated_query(db_session):
    match, score = exercise_catalog_service.best_match(db_session, "zzzzz not an exercise at all")
    assert score < exercise_catalog_service.FUZZY_MATCH_THRESHOLD or match is None


def test_best_match_finds_same_row_via_turkish_or_english_name(db_session):
    tr_match, tr_score = exercise_catalog_service.best_match(db_session, "Şınav")
    en_match, en_score = exercise_catalog_service.best_match(db_session, "Push Up")
    assert tr_match is not None and en_match is not None
    assert tr_match.id == en_match.id
    assert tr_score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD
    assert en_score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_search_exercises_finds_match_by_english_query(db_session):
    results = exercise_catalog_service.search_exercises(db_session, "push up", limit=3)
    names = [row.name_tr for row in results]
    assert "Şınav" in names


def test_search_exercises_does_not_return_duplicate_rows(db_session):
    # Aday listesi her satırı iki kez (TR+EN) içeriyor - sonuç dedupe edilmiş
    # olmalı, aynı satır iki kez dönmemeli.
    results = exercise_catalog_service.search_exercises(db_session, "press", limit=10)
    ids = [row.id for row in results]
    assert len(ids) == len(set(ids))


def test_best_match_ignores_parenthetical_descriptor(db_session):
    """Canlı testte bulundu (2026-08-08): model sıkça tanımlayıcı bir
    parantez ekliyor (ör. 'chest press makinesi (üst göğüs odaklı)') — bu
    kelimeler kataloğun kullanmadığı serbest açıklamalar, eklenince
    kelime-eşleştirme aşamasını kırıp aramanın YALNIZ başına 'bench press'
    ile başaracağı eşleşmeyi kaçırıyordu (bkz. fuzzy_match._strip_parenthetical)."""
    match, score = exercise_catalog_service.best_match(
        db_session, "Barbell Bench Press (üst göğüs odaklı)"
    )
    assert match is not None
    assert match.name_tr == "Barbell Bench Press"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_ignores_generic_movement_filler_word(db_session):
    """Canlı testte bulundu (2026-08-31): kullanıcı 'skullcrusher hareketinde'
    dedi, model bunu (yanlış çeviri/halüsinasyonla) alakasız bir 'kayma
    hareketi' sorgusuna dönüştürdü. Kataloğun HİÇBİR yerinde 'kayma' geçmezken
    'hareketi' kelimesi kataloğun bazı kayıtlarında (ör. 'Kayaklama Hareketi')
    tesadüfen geçtiği için _one_word_short_matches bunu 88 puanla (eşiğin
    üstünde) yanlışlıkla 'kesin eşleşme' sayıyordu - egzersiz tamamen yanlış
    isimle kaydediliyordu. Doğru davranış: alakasız içerik kelimesi ('kayma')
    hiçbir kayda uymadığı için eşiğin ALTINDA bir skor (ya da eşleşme yok)
    dönmeli, 'hareketi' filler kelimesi bu sonucu değiştirmemeli (bkz.
    fuzzy_match._strip_filler_words)."""
    match, score = exercise_catalog_service.best_match(db_session, "kayma hareketi")
    assert match is None or match.name_tr != "Kayaklama Hareketi" or score < exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_still_matches_when_query_has_filler_word_plus_real_name(db_session):
    """Filler kelimesi temizliği gerçek eşleşmeleri KIRMAMALI - sorgudaki asıl
    egzersiz adı hâlâ kataloğa uyuyorsa (ör. 'Squat hareketi') eşleşme
    eskisi gibi bulunmalı."""
    match, score = exercise_catalog_service.best_match(db_session, "Squat hareketi")
    assert match is not None
    assert match.name_tr == "Squat"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_handles_makine_case_suffix_plus_extra_preposition(db_session):
    """Canlı testte bulundu (2026-08-31): 'peck deck makinesinde göğüs için
    3x10 65kg yaptım' sorgusu, model tarafından 'peck deck makinesinde göğüs
    için' olarak yazıldı. Katalog kaydı sade 'Peck Deck Makinesi' - sorgudaki
    'makinesinde' (bulunma hâli eki) kaydın 'makinesi'sinden (iyelik eki)
    FARKLI bir çekim olduğu için literal alt-dize eşleşmiyordu, üstüne 'için'
    (edat, kataloğun hiçbir yerinde geçmiyor) eksik kelime sayısını 2'ye
    çıkarıp '1 kelime eksik' toleransını da aşıyordu - eşleşme tamamen
    kaçıyor, egzersiz kataloğa hiç bağlanmadan ham isimle kaydediliyordu.
    Bu ikisi (edat temizliği + aynı kök farklı hâl eki) birlikte test
    ediliyor çünkü canlı testte tam bu kombinasyonda ortaya çıktı."""
    match, score = exercise_catalog_service.best_match(
        db_session, "peck deck makinesinde göğüs için"
    )
    assert match is not None
    assert match.name_tr == "Peck Deck Makinesi"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_canonical_name_returns_tr_by_default(db_session):
    match, _score = exercise_catalog_service.best_match(db_session, "Squat")
    assert exercise_catalog_service.canonical_name(match, "squat") == "Squat"


def test_canonical_name_returns_en_when_requested(db_session):
    match, _score = exercise_catalog_service.best_match(db_session, "Şınav")
    assert exercise_catalog_service.canonical_name(match, "şınav", language="en") == "Push-Up"


def test_canonical_name_falls_back_to_raw_name_when_no_match():
    assert exercise_catalog_service.canonical_name(None, "bilinmeyen hareket", language="en") == "bilinmeyen hareket"


def test_fuzzy_match_deprioritizes_equipment_variant_over_plain_match():
    """Regresyon testi — bkz. project_health_coach_status.md, 2026-08-08
    'squat/lateral bare-kelime' turu. Kataloğa sade bir kanonik kayıt hiç
    eklenmemişse (ör. sadece 'Squat Jerk' ve 'Squat with Bands' gibi
    varyantlar varsa), bant/zincir/plaka belirten bir varyant SADECE
    UZUNLUĞU KISA diye kanonik-olmayan başka bir hareketin ('Squat Jerk'
    gibi) önüne geçmemeli — sorgu bunu istemiyorsa `_prefix_rank` bunu
    tier-2'ye iter (bkz. fuzzy_match.py). Gerçek regresyon: 'squat' sorgusu
    canlı katalogda 'Squat Jerk'e (58 puanla değil 100 puanla, YANLIŞ bir
    Olimpik kaldırış tekniğine) eşleşiyordu."""
    items = ["Squat Jerk", "Squat with Bands", "Squat with Chains"]
    match, score = fuzzy_match.best_match("squat", items, lambda x: x)
    assert match == "Squat Jerk"


def test_fuzzy_match_keeps_equipment_variant_when_query_asks_for_it():
    """Yukarıdaki testin tersi: kullanıcı ZATEN 'bantlı squat' gibi bir
    ekipman varyantı istiyorsa, o varyant demote EDİLMEMELİ — tier-2 kuralı
    sadece sorgu bunu istemediği hâlde bir varyantın öne geçmesini önlüyor."""
    items = ["Squat Jerk", "Squat with Bands", "Squat with Chains"]
    match, score = fuzzy_match.best_match("squat with bands", items, lambda x: x)
    assert match == "Squat with Bands"


def test_search_exercises_cache_refreshes_after_invalidate(db_session):
    """Katalog process-level cache'leniyor (bkz. exercise_catalog_service.py) -
    aynı session/engine'e sonradan eklenen bir satır invalidate_cache()
    çağrılmadan görünmemeli, çağrıldıktan sonra görünmeli."""
    exercise_catalog_service.search_exercises(db_session, "squat", limit=3)  # cache doldurulur

    db_session.add(
        ExerciseCatalog(
            source_id="Brand_New_Exercise",
            name_en="Brand new exercise",
            name_tr="Yepyeni egzersiz",
            category_tr="kuvvet",
            equipment_tr="yok",
            primary_muscles_tr="tüm vücut",
            level_tr="başlangıç",
        )
    )
    db_session.commit()

    stale_results = exercise_catalog_service.search_exercises(db_session, "yepyeni egzersiz", limit=3)
    stale_names = [row.name_tr for row in stale_results]
    assert "Yepyeni egzersiz" not in stale_names

    exercise_catalog_service.invalidate_cache()
    fresh_results = exercise_catalog_service.search_exercises(db_session, "yepyeni egzersiz", limit=3)
    names = [row.name_tr for row in fresh_results]
    assert "Yepyeni egzersiz" in names


def test_best_match_prefers_wide_grip_over_single_arm_variant(db_session):
    """Canlı testte bulundu (2026-08-31): "geniş tutuş lat pulldown" sorgusu
    (model bazen sadece "lat pulldown" olarak kısaltıyor) katalogda "Tek
    Kollu Lat Aşağı Çekiş" (One Arm Lat Pulldown) gibi TAMAMEN farklı bir
    varyanta eşleşiyordu - kullanıcı çift kollu/geniş tutuş bir hareket
    tarif etmişti. "geniş tutuş" (wide-grip) sorguda açıkça belirtildiğinde,
    adı "Geniş Tutuş..." ile BAŞLAYAN (sorgunun ilk kelimeleriyle) doğru
    varyant artık kazanıyor (bkz. fuzzy_match._anchor_rank)."""
    session = db_session
    session.add_all(
        [
            ExerciseCatalog(
                source_id="One_Arm_Lat_Pulldown",
                name_en="One Arm Lat Pulldown",
                name_tr="Tek Kollu Lat Aşağı Çekiş",
                category_tr="kuvvet",
                equipment_tr="kablo",
                primary_muscles_tr="sırt",
                level_tr="orta",
            ),
            ExerciseCatalog(
                source_id="Wide_Grip_Lat_Pulldown",
                name_en="Wide-Grip Lat Pulldown",
                name_tr="Geniş Tutuş Lat Aşağı Çekme",
                category_tr="kuvvet",
                equipment_tr="kablo",
                primary_muscles_tr="sırt",
                level_tr="orta",
            ),
        ]
    )
    session.commit()

    match, score = exercise_catalog_service.best_match(session, "geniş tutuş lat pulldown")

    assert match is not None
    assert match.name_tr == "Geniş Tutuş Lat Aşağı Çekme"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_synonym_matches_are_exempt_from_anchor_check(db_session):
    """Regresyon koruması (2026-08-31): _anchor_rank/"şüpheli tam eşleşme"
    denetimi eklenirken bir turda "chest press makinesi" sorgusu, kaldıraç↔
    makine eşanlamlılığıyla (bkz. _word_satisfied) doğru eşleşen "Kaldıraç
    Göğüs Presi" yerine YANLIŞLIKLA daha kısa ama alakasız "Kablo Göğüs
    Presi"ye kaymıştı - çünkü "Leverage Chest Press" (adının İngilizcesi)
    sorgudaki hiçbir kelimeyle literal BAŞLAMIYOR (adı "Leverage" ile
    başlıyor, sorguda o kelime hiç yok). Eşanlamlı-kural içeren eşleşmeler
    artık bu "isim başı" denetiminden muaf - zaten özel olarak curate
    edilmiş oldukları için güvenilir kabul ediliyor."""
    session = db_session
    session.add_all(
        [
            ExerciseCatalog(
                source_id="Leverage_Chest_Press",
                name_en="Leverage Chest Press",
                name_tr="Kaldıraç Göğüs Presi",
                category_tr="kuvvet",
                equipment_tr="makine",
                primary_muscles_tr="göğüs",
                level_tr="orta",
            ),
            ExerciseCatalog(
                source_id="Cable_Chest_Press",
                name_en="Cable Chest Press",
                name_tr="Kablo Göğüs Presi",
                category_tr="kuvvet",
                equipment_tr="kablo",
                primary_muscles_tr="göğüs",
                level_tr="orta",
            ),
        ]
    )
    session.commit()

    match, score = exercise_catalog_service.best_match(session, "chest press makinesi")

    assert match is not None
    assert match.name_tr == "Kaldıraç Göğüs Presi"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_keeps_stance_prefixed_exercise_over_unrelated_short_match(db_session):
    """Canlı testte bulundu (2026-08-31), önceki bir düzeltmenin (bkz.
    test_food_catalog_service.py::
    test_best_match_compound_dish_vs_plain_variant_is_a_known_accepted_limitation)
    GERİ ALINMASINA yol açan regresyon: "military press" sorgusu, kataloğun
    doğru cevabı "Standing Military Press" / "Ayakta Asker Presi (Military
    Press)" "standing"/"ayakta" duruş öneki yüzünden sorgunun hiçbir
    kelimesiyle BAŞLAMADIĞI için "şüpheli" sayılıp TAMAMEN alakasız bir
    "Press Sit-Up" (karın egzersizi, "press" ile başladığı için 1-eksik
    katmanında "güvenilir" görünüyordu) sonucuna kaymıştı. Duruş/varyant
    öneki (Standing/Seated/Ayakta/Oturarak) kataloğun 130+ kaydında
    NORMAL bir kalıp - "çapasız tam eşleşme" tek başına güvenilmezlik
    sinyali SAYILMAMALI."""
    session = db_session
    session.add_all(
        [
            ExerciseCatalog(
                source_id="Standing_Military_Press",
                name_en="Standing Military Press",
                name_tr="Ayakta Asker Presi (Military Press)",
                category_tr="kuvvet",
                equipment_tr="barbell",
                primary_muscles_tr="omuz",
                level_tr="orta",
            ),
            ExerciseCatalog(
                source_id="Press_Sit_Up",
                name_en="Press Sit-Up",
                name_tr="İtme Mekik (Press Sit-Up)",
                category_tr="kuvvet",
                equipment_tr="dambıl",
                primary_muscles_tr="karın",
                level_tr="orta",
            ),
        ]
    )
    session.commit()

    match, score = exercise_catalog_service.best_match(session, "military press")

    assert match is not None
    assert match.name_tr == "Ayakta Asker Presi (Military Press)"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_handles_english_plural_suffix(db_session):
    """Canlı testte bulundu (2026-08-31): sözcük-sınırı düzeltmesi (bkz.
    test_best_match_keeps_stance_prefixed_exercise_over_unrelated_short_match'in
    kardeşi) "seated row" sorgusunda "row" kelimesinin kataloğun doğru
    kaydındaki "Rows" (İngilizce çoğul) içinde ARTIK bulunamamasına yol
    açmıştı - "Seated Cable Rows" tamamen kaçırılıp alakasız bir "Seated
    Glute" sonucuna kayılıyordu. `_contains_word`'e TEK harflik bir sondan
    sonra tolerans eklendi (bkz. dosyadaki yorum) - "row" artık "rows"
    içinde de bulunuyor, ama "et" (2 harf) + "li" (2 harf ek) = "Etli"
    bug'ı GERİ AÇILMADI (2 harflik ek, 1 harflik toleransı aşıyor)."""
    session = db_session
    session.add_all(
        [
            ExerciseCatalog(
                source_id="Seated_Cable_Rows",
                name_en="Seated Cable Rows",
                name_tr="Oturarak Kablo Kürek Çekme",
                category_tr="kuvvet",
                equipment_tr="kablo",
                primary_muscles_tr="sırt",
                level_tr="orta",
            ),
            ExerciseCatalog(
                source_id="Seated_Glute",
                name_en="Seated Glute",
                name_tr="Oturarak Glute (Kalça)",
                category_tr="kuvvet",
                equipment_tr="makine",
                primary_muscles_tr="kalça",
                level_tr="orta",
            ),
        ]
    )
    session.commit()

    match, score = exercise_catalog_service.best_match(session, "seated row")

    assert match is not None
    assert match.name_tr == "Oturarak Kablo Kürek Çekme"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_handles_english_capital_i_not_turkified(db_session):
    """Canlı testte bulundu (2026-08-31): `tr_lower`, İngilizce bir isimdeki
    büyük "I"yi de (ör. "Incline" -> "ıncline") Türkçe kuralına göre
    noktasız "ı"ya çeviriyor - bilingual katalogtaki name_en alanı
    İNGİLİZCE olduğu için bu YANLIŞ. "incline bench press" sorgusundaki
    normal (ASCII) "incline" bu yüzden "ıncline" içinde hiç bulunamıyor,
    doğru kayıt tamamen kaçırılıp alakasız bir sonuca ("Bench Press with
    Chains") kayıyordu. `_i_tolerant_pattern` ile "i" artık "ı" ile de
    eşleşiyor."""
    session = db_session
    session.add_all(
        [
            ExerciseCatalog(
                source_id="Incline_Bench_Press",
                name_en="Barbell Incline Bench Press - Medium Grip",
                name_tr="Orta Tutuşla Eğimli Sehpası İtmesi",
                category_tr="kuvvet",
                equipment_tr="barbell",
                primary_muscles_tr="göğüs",
                level_tr="orta",
            ),
            ExerciseCatalog(
                source_id="Bench_Press_Chains",
                name_en="Bench Press with Chains",
                name_tr="Zincirlerle Bench Pres",
                category_tr="kuvvet",
                equipment_tr="barbell",
                primary_muscles_tr="göğüs",
                level_tr="orta",
            ),
        ]
    )
    session.commit()

    match, score = exercise_catalog_service.best_match(session, "incline bench press")

    assert match is not None
    assert match.name_tr == "Orta Tutuşla Eğimli Sehpası İtmesi"
    assert score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD
