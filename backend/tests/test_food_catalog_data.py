"""Elle yazılan besin verisinin (seed_tr_foods.FOODS, food_catalog_fixes,
food_aliases) tutarlılık testleri - DB gerektirmez."""

from collections import Counter

from scripts.food_catalog_fixes import NAME_FIXES
from scripts.seed_tr_foods import FOODS
from app.services.food_aliases import FOOD_ALIASES
from app.services.fuzzy_match import tr_lower


def test_curated_foods_calories_match_macros():
    """Kalori, makrolardan (4P + 4K + 9Y) %15'ten fazla sapmamalı - lahmacun'un
    eski değeri %16 sapıyordu (2026-09-27). Çok düşük kalorili içecekler hariç."""
    bad = []
    for fdc_id, name, _en, _cat, kcal, protein, carbs, fat, fiber, *_rest in FOODS:
        # Lif ~2 kcal/g (USDA sebzelerde böyle hesaplıyor, ör. haşlanmış ıspanak)
        # ama kaynaklar lifi farklı sayıyor - iki hesaptan biri tutmalı.
        fib = min(fiber or 0.0, carbs)
        plain = 4 * protein + 4 * carbs + 9 * fat
        fiber_adjusted = plain - 2 * fib
        if max(kcal, plain) < 25:
            continue
        if not any(0.85 <= kcal / calc <= 1.15 for calc in (plain, fiber_adjusted) if calc):
            bad.append((fdc_id, name, kcal, round(plain)))
    assert not bad, bad


def test_curated_foods_have_unique_ids_and_names():
    ids = Counter(row[0] for row in FOODS)
    names = Counter(tr_lower(row[1]) for row in FOODS)
    assert [k for k, n in ids.items() if n > 1] == []
    assert [k for k, n in names.items() if n > 1] == []


def test_curated_foods_macros_are_physically_possible():
    for row in FOODS:
        protein, carbs, fat = row[5], row[6], row[7]
        assert min(protein, carbs, fat) >= 0 and protein + carbs + fat <= 100, row[1]


def test_name_fixes_are_clean():
    for fdc_id, name in NAME_FIXES.items():
        assert name == name.strip() and "@" not in name and "\n" not in name, fdc_id
        assert len(name) < 200, fdc_id  # isim yerine prompt sızıntısı (2026-09-27)


def test_aliases_point_to_curated_or_known_names():
    """Eşleme hedefi seed listesindeki bir isimse birebir yazılmış olmalı
    (büyük/küçük harf farkı eşlemeyi sessizce devre dışı bırakır)."""
    curated = {row[1] for row in FOODS}
    curated_lower = {tr_lower(n): n for n in curated}
    for target in FOOD_ALIASES.values():
        if tr_lower(target) in curated_lower:
            assert target in curated, target


def test_exercise_alias_keys_are_normalized():
    from app.services.exercise_aliases import EXERCISE_ALIASES

    for key in EXERCISE_ALIASES:
        assert key == " ".join(tr_lower(key).split()), key


def test_curated_fiber_and_sugar_do_not_exceed_carbs():
    """Karbonhidrat TOPLAM değerdir (lif ve şeker dahil). "Ispanak, çiğ"
    net karbonhidratla (0.55 g) girilmişti, lifi 2.58 g idi (2026-09-28)."""
    bad = []
    for row in FOODS:
        name, carbs, fiber, sugar = row[1], row[6], row[8], row[9]
        if (fiber is not None and fiber > carbs + 0.5) or (sugar is not None and sugar > carbs + 0.5):
            bad.append((name, carbs, fiber, sugar))
    assert bad == []


def test_clean_unspecified_suffixes_strips_nfs_and_resolves_collisions():
    """2026-10-06 canlı test: "Oatmeal, NFS" / "Yulaf ezmesi, NFS" kullanıcıya anlamsızdı."""
    from sqlalchemy.orm import sessionmaker

    from app.db.base import Base
    from app.models.food_catalog import FoodCatalog
    from scripts.food_catalog_fixes import clean_unspecified_suffixes
    from tests.db_utils import make_test_engine

    engine = make_test_engine()
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    rows = [
        ("Milk, NFS", "Süt, NFS"),
        ("Butter", "Tereyağı"),
        ("Butter, NFS", "Tereyağı, NFS"),
        ("Water, still (NFS)", "Su, gazsız (NFS)"),
        ("Chicken, NS as to part", "Tavuk, parça belirtilmemiş (NS)"),
        ("Milk, evaporated, NS as to fat content", "Süt, buharlaştırılmış, yağ içeriği belirtilmemiş"),
    ]
    for i, (en, tr) in enumerate(rows):
        db.add(FoodCatalog(fdc_id=i + 1, name_en=en, name_tr=tr, data_type="test", calories_kcal=1, protein_g=0, carbs_g=0, fat_g=0))
    db.flush()

    assert clean_unspecified_suffixes(db) > 0
    names = {(r.name_en, r.name_tr) for r in db.query(FoodCatalog)}
    assert ("Milk", "Süt") in names
    assert ("Butter (generic)", "Tereyağı (genel)") in names
    assert ("Water, still", "Su, gazsız") in names
    assert ("Chicken, NS as to part", "Tavuk, parça belirtilmemiş") in names
    assert ("Milk, evaporated, NS as to fat content", "Süt, buharlaştırılmış, yağ içeriği belirtilmemiş") in names
    assert clean_unspecified_suffixes(db) == 0  # idempotent
    db.close()


def test_aliases_do_not_target_unspecified_names():
    # NFS ekleri katalogdan atıldı (2026-10-06) - eski adı hedefleyen eşleme sessizce boşa düşerdi.
    assert not [t for t in FOOD_ALIASES.values() if "NFS" in t or "(NS)" in t]
