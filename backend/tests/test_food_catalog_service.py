import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    catalog = [
        FoodCatalog(
            fdc_id=1,
            name_en="Chicken breast, raw",
            name_tr="Tavuk göğsü, çiğ",
            data_type="sr_legacy_food",
            category_tr="Kanatlı Eti Ürünleri",
            calories_kcal=119,
            protein_g=21.4,
            carbs_g=0.0,
            fat_g=3.08,
        ),
        FoodCatalog(
            fdc_id=2,
            name_en="Rice, white, cooked",
            name_tr="Pirinç, beyaz, pişmiş",
            data_type="sr_legacy_food",
            category_tr="Tahıllar ve Makarna",
            calories_kcal=130,
            protein_g=2.7,
            carbs_g=28.2,
            fat_g=0.3,
        ),
    ]
    session.add_all(catalog)
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_search_foods_finds_close_match(db_session):
    results = food_catalog_service.search_foods(db_session, "tavuk göğsü", limit=5)
    names = [row.name_tr for row in results]
    assert "Tavuk göğsü, çiğ" in names


def test_search_foods_returns_empty_list_when_catalog_empty():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    assert food_catalog_service.search_foods(session, "pirinç") == []
    session.close()


def test_best_match_returns_high_score_for_exact_name(db_session):
    match, score = food_catalog_service.best_match(db_session, "Pirinç, beyaz, pişmiş")
    assert match is not None
    assert match.fdc_id == 2
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_canonical_name_returns_tr_by_default(db_session):
    match, _score = food_catalog_service.best_match(db_session, "Tavuk göğsü, çiğ")
    assert food_catalog_service.canonical_name(match, "tavuk göğsü") == "Tavuk göğsü, çiğ"


def test_canonical_name_returns_en_when_requested(db_session):
    match, _score = food_catalog_service.best_match(db_session, "Tavuk göğsü, çiğ")
    assert food_catalog_service.canonical_name(match, "tavuk göğsü", language="en") == "Chicken breast, raw"


def test_canonical_name_falls_back_to_raw_name_when_no_match():
    assert food_catalog_service.canonical_name(None, "bilinmeyen besin", language="en") == "bilinmeyen besin"


def test_best_match_prefers_prefix_match_over_shorter_word_containing_candidate(db_session):
    """Gerçek regresyon (2026-08-01): 'Pirinç pilavı (sade)' kataloğa
    eklendikten sonra 'Şehriyeli pirinç pilavı' de eklenince, fuzzy-match'in
    'sorgunun tüm kelimelerini içeren EN KISA kayıt' kuralı "pirinç pilavı"
    aramasını yanlışlıkla şehriyeli varyanta yönlendirdi (o isim daha
    kısaydı) — sade pilav ismi 'pirinç pilavı' ile BAŞLADIĞI için artık
    doğrudan (starts-with) eşleşip önceliği alıyor."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=100,
                name_en="Rice pilaf, plain",
                name_tr="Pirinç pilavı (sade)",
                data_type="tr_curated",
                category_tr="Tahıllar ve Makarna",
                calories_kcal=130,
                protein_g=2.7,
                carbs_g=28.2,
                fat_g=0.3,
            ),
            FoodCatalog(
                fdc_id=101,
                name_en="Rice pilaf with vermicelli",
                name_tr="Şehriyeli pirinç pilavı",
                data_type="tr_curated",
                category_tr="Tahıllar ve Makarna",
                calories_kcal=171,
                protein_g=3.16,
                carbs_g=30.69,
                fat_g=3.74,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "pirinç pilavı")

    assert match is not None
    assert match.fdc_id == 100
    assert score == 100.0


def test_best_match_prefers_qualified_variant_over_shorter_unrelated_compound(db_session):
    """Gerçek regresyon (2026-08-01, fotoğraf analizi canlı testinde
    bulundu): "domates" sorgusu, katalogda "Domates, çiğ" gibi nitelikli bir
    varyant yokken, sadece EN KISA isim olduğu için "Domates tozu"na (kurutulmuş
    toz, ~302 kcal/100g) eşleşiyordu — gerçek domatesten (~18 kcal/100g) ~17x
    yanlış bir kalori değeri sessizce döndürülüyordu. Artık "İsim, sıfat"
    kalıbına uyan nitelikli varyantlar (aynı temel besinin çeşidi), sadece
    sorguyla başlayan ama virgülsüz devam eden alakasız/farklı bir ürünün
    (ör. "...tozu", "...sosu") önüne geçiyor."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=200,
                name_en="Tomato powder",
                name_tr="Domates tozu",
                data_type="sr_legacy_food",
                category_tr="Sebzeler",
                calories_kcal=302,
                protein_g=12.9,
                carbs_g=74.7,
                fat_g=0.44,
            ),
            FoodCatalog(
                fdc_id=201,
                name_en="Tomatoes, yellow, raw",
                name_tr="Domates, sarı, çiğ",
                data_type="sr_legacy_food",
                category_tr="Sebzeler",
                calories_kcal=15,
                protein_g=0.98,
                carbs_g=2.98,
                fat_g=0.26,
            ),
            FoodCatalog(
                fdc_id=202,
                name_en="Tomatoes, red, ripe, raw",
                name_tr="Domates, çiğ",
                data_type="tr_curated",
                category_tr="Sebzeler",
                calories_kcal=18,
                protein_g=0.88,
                carbs_g=3.89,
                fat_g=0.2,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "domates")

    assert match is not None
    assert match.fdc_id == 202
    assert score == 100.0


def test_search_foods_finds_match_by_english_query(db_session):
    results = food_catalog_service.search_foods(db_session, "chicken breast", limit=5)
    names = [row.name_tr for row in results]
    assert "Tavuk göğsü, çiğ" in names


def test_best_match_finds_same_row_via_turkish_or_english_name(db_session):
    tr_match, tr_score = food_catalog_service.best_match(db_session, "Tavuk göğsü, çiğ")
    en_match, en_score = food_catalog_service.best_match(db_session, "Chicken breast, raw")
    assert tr_match is not None and en_match is not None
    assert tr_match.id == en_match.id
    assert tr_score >= food_catalog_service.FUZZY_MATCH_THRESHOLD
    assert en_score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_drops_unmatched_descriptive_word(db_session):
    """Gerçek eksik (2026-08-02): fotoğraf analizi modelinin doğal olarak
    eklediği ama kataloğun hiç kullanmadığı tanımlayıcı ekler ("ıspanak
    YAPRAKLARI", kataloğun ismi sadece "Ispanak, çiğ") sorguyu tamamen
    eşleşmez hale getiriyordu. Artık kataloğun hiçbir isminde geçmeyen tek
    kelime düşürülüp çekirdek kelimeyle tekrar denenir."""
    session = db_session
    session.add(
        FoodCatalog(
            fdc_id=300,
            name_en="Spinach, raw",
            name_tr="Ispanak, çiğ",
            data_type="tr_curated",
            category_tr="Sebzeler",
            calories_kcal=23,
            protein_g=2.86,
            carbs_g=3.63,
            fat_g=0.39,
        )
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "ıspanak yaprakları")

    assert match is not None
    assert match.fdc_id == 300
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_returns_low_score_for_unrelated_query(db_session):
    """İlgisiz/gürültülü, çok kelimeli bir sorgu zorla bir kayda
    eşleştirilmemeli — "tam olarak 1 kelime eksik" toleransı, sorgu
    uzadıkça (6 kelime) hiçbir kaydın karşılayamayacağı bir eşik haline
    gelir (bkz. fuzzy_match._one_word_short_matches)."""
    match, score = food_catalog_service.best_match(db_session, "zzzzz not a real food at all")
    assert score < food_catalog_service.FUZZY_MATCH_THRESHOLD or match is None


def test_search_foods_drops_unmatched_descriptive_word(db_session):
    session = db_session
    session.add(
        FoodCatalog(
            fdc_id=301,
            name_en="Almonds, roasted",
            name_tr="Badem, ballı kavrulmuş",
            data_type="tr_curated",
            category_tr="Kuruyemişler",
            calories_kcal=598,
            protein_g=20.9,
            carbs_g=19.7,
            fat_g=52.5,
        )
    )
    session.commit()

    results = food_catalog_service.search_foods(session, "kavrulmuş badem dilimleri", limit=5)
    names = [row.name_tr for row in results]
    assert "Badem, ballı kavrulmuş" in names


def test_search_foods_cache_refreshes_after_invalidate(db_session):
    """Katalog process-level cache'leniyor (bkz. food_catalog_service.py) -
    aynı session/engine'e sonradan eklenen bir satır invalidate_cache()
    çağrılmadan görünmemeli, çağrıldıktan sonra görünmeli."""
    food_catalog_service.search_foods(db_session, "tavuk göğsü", limit=5)  # cache doldurulur

    db_session.add(
        FoodCatalog(
            fdc_id=999,
            name_en="Brand new food",
            name_tr="Yepyeni besin",
            data_type="tr_curated",
            category_tr="Diğer",
            calories_kcal=100,
            protein_g=1.0,
            carbs_g=1.0,
            fat_g=1.0,
        )
    )
    db_session.commit()

    stale_results = food_catalog_service.search_foods(db_session, "yepyeni besin", limit=5)
    stale_names = [row.name_tr for row in stale_results]
    assert "Yepyeni besin" not in stale_names

    food_catalog_service.invalidate_cache()
    fresh_results = food_catalog_service.search_foods(db_session, "yepyeni besin", limit=5)
    names = [row.name_tr for row in fresh_results]
    assert "Yepyeni besin" in names


def test_best_match_prefers_food_name_starting_with_query_word_over_unrelated_dish(db_session):
    """Canlı testte bulundu (2026-08-31): "somon balığı" sorgusu kataloğun
    "somon" geçen YÜZLERCE kaydı arasından en kısası olan "Lomi somon"a
    (alakasız bir Hawaii çiğ balık yemeği) kilitleniyordu - adı "somon" ile
    HİÇ başlamıyordu, sadece içinde geçiyordu. Artık "1 kelime eksik"
    katmanında adı gerçekten sorgunun bir kelimesiyle BAŞLAYAN adaylar
    tercih ediliyor (bkz. fuzzy_match._name_starts_with_present_word)."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=300,
                name_en="Lomi salmon",
                name_tr="Lomi somon",
                data_type="sr_legacy_food",
                category_tr="Karışık Yemekler",
                calories_kcal=90,
                protein_g=8.0,
                carbs_g=3.0,
                fat_g=5.0,
            ),
            FoodCatalog(
                fdc_id=301,
                name_en="Salmon fillet, grilled/baked",
                name_tr="Somon fileto, ızgara/fırınlanmış",
                data_type="sr_legacy_food",
                category_tr="Balık ve Deniz Ürünleri",
                calories_kcal=206,
                protein_g=22.1,
                carbs_g=0.0,
                fat_g=12.4,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "somon balığı")

    assert match is not None
    assert match.fdc_id == 301
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_compound_dish_vs_plain_variant_is_a_known_accepted_limitation(db_session):
    """BİLİNÇLİ olarak KABUL EDİLMİŞ bir sınır durumu, "düzeltilmesi
    gereken" bir bug DEĞİL - bu test sadece davranışı belgeliyor.

    Canlı testte bulundu (2026-08-31): "haşlanmış brokoli" sorgusu
    kataloğun TEK bir kaydında ("Haşlanmış erişte ile brokoli grateni" -
    makarna+peynirli karışık bir yemek) her iki kelime de (SAF alt-dize
    olarak) geçtiği için tam eşleşme (0 eksik) sayılıp doğrudan kazanıyor;
    oysa adı sorgunun SON kelimesiyle ("brokoli") başlayan, daha güvenilir
    sade bir aday da var. İlk denemede "tam eşleşme adı sorgunun bir
    kelimesiyle başlamıyorsa 1-eksik katmanına düş" kuralı eklenip bu
    DÜZELTİLMİŞTİ - ama AYNI turda ikinci bir canlı testte bu kuralın
    "military press" gibi kataloğun Standing/Seated/Ayakta/Oturarak duruş
    önekiyle başlayan 130+ GERÇEK/DOĞRU kaydını da "şüpheli" sayıp TAMAMEN
    alakasız bir sonuca (İtme Mekik/Press Sit-Up) kaydırdığı bulundu -
    "çapasız tam eşleşme" kataloğun bu kadar geniş bir bölümünde NORMAL ve
    GÜVENİLİR bir kalıp olduğu için, bu kural GERİ ALINDI (bkz.
    fuzzy_match.py'deki best_match yorum notu). İki bug arasında (dar bir
    yemek-eşleşmesi hatası vs. kataloğun geniş bir sınıfını bozan bir
    regresyon) ikincisinin riski çok daha büyük olduğu için bu tercih
    edildi."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=310,
                name_en="Boiled noodles with broccoli gratin",
                name_tr="Haşlanmış erişte ile brokoli grateni",
                data_type="sr_legacy_food",
                category_tr="Karışık Yemekler",
                calories_kcal=112,
                protein_g=3.55,
                carbs_g=15.9,
                fat_g=3.77,
            ),
            FoodCatalog(
                fdc_id=311,
                name_en="Broccoli, fresh, cooked, no added fat",
                name_tr="Brokoli, taze, pişmiş, yağ eklenmemiş",
                data_type="sr_legacy_food",
                category_tr="Sebzeler",
                calories_kcal=41,
                protein_g=2.67,
                carbs_g=6.51,
                fat_g=0.35,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "haşlanmış brokoli")

    assert match is not None
    assert match.fdc_id == 310  # bilinçli kabul edilen (ideal olmayan) sonuç
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_ignores_small_standalone_numbers(db_session):
    """Canlı testte bulundu (2026-08-31): "1 dilim ekmek" sorgusu, kataloğun
    "1 küçük köfte" gibi TAMAMEN alakasız bir hamburger kaydında da "1"
    literal geçtiği için _one_word_short_matches'i yanıltıp "Hamburger,
    beyaz ekmekte, 1 küçük köfte"ye kayıyordu - kullanıcı sadece bir dilim
    ekmek yediğini söylerken kayıt bir hamburger olarak işlendi. Küçük,
    tek başına duran sayılar (1-30, porsiyon sayısı) artık sorgudan baştan
    temizleniyor (bkz. fuzzy_match._SMALL_NUMBER_RE)."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=320,
                name_en="Cheeseburger, on white bread, 1 small patty",
                name_tr="Hamburger, beyaz ekmekte, 1 küçük köfte",
                data_type="sr_legacy_food",
                category_tr="Karışık Yemekler",
                calories_kcal=280,
                protein_g=15.0,
                carbs_g=25.0,
                fat_g=13.0,
            ),
            FoodCatalog(
                fdc_id=321,
                name_en="Bread, white",
                name_tr="Ekmek, beyaz",
                data_type="sr_legacy_food",
                category_tr="Tahıllar ve Makarna",
                calories_kcal=266,
                protein_g=9.0,
                carbs_g=50.0,
                fat_g=3.3,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "1 dilim ekmek")

    assert match is not None
    assert match.fdc_id != 320, "hamburger kaydına kaymamalı"
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD


def test_best_match_does_not_match_short_word_inside_unrelated_word(db_session):
    """Canlı testte bulundu (2026-08-31): "kırmızı et" (red MEAT) sorgusu
    "Etli kırmızı fasulye"ye (meaty red BEANS, et hiç yok) 95 puanla
    eşleşti - çünkü "et" (2 harf) kelimesi "Etli"nin İLK İKİ HARFİYLE
    literal alt-dize olarak eşleşiyordu (düz `in` kontrolü sözcük sınırı
    gözetmiyordu). Kısa/yaygın kelimelerde (et, su, un vb.) ciddi bir
    hata sınıfı - artık `\b` (sözcük sınırı) ile düzeltildi (bkz.
    fuzzy_match._contains_word)."""
    session = db_session
    session.add_all(
        [
            FoodCatalog(
                fdc_id=330,
                name_en="Red beans with meat",
                name_tr="Etli kırmızı fasulye",
                data_type="sr_legacy_food",
                category_tr="Karışık Yemekler",
                calories_kcal=173,
                protein_g=8.5,
                carbs_g=20.0,
                fat_g=6.0,
            ),
            FoodCatalog(
                fdc_id=331,
                name_en="Beef, ground, NFS",
                name_tr="Et, kıyma, NFS",
                data_type="sr_legacy_food",
                category_tr="Kırmızı Et Ürünleri",
                calories_kcal=254,
                protein_g=17.2,
                carbs_g=0.0,
                fat_g=20.0,
            ),
        ]
    )
    session.commit()

    match, score = food_catalog_service.best_match(session, "kırmızı et")

    assert match is not None
    assert match.fdc_id != 330, "'et' kelimesi 'Etli'nin İÇİNDE yanlışlıkla eşleşmemeli"
    assert score >= food_catalog_service.FUZZY_MATCH_THRESHOLD
