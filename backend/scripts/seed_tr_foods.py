"""Türk mutfağında yaygın olan ama USDA-kökenli food_catalog'da eksik ya da
kötü çevrilmiş/alakasız (ör. Amerikan markalı ürünler, yabani ıspanak, mung
fasulyesi "yeşil mercimek" olarak etiketlenmiş vb.) besinler için temiz,
doğru isimlendirilmiş girdiler ekler.

Değerler internetten (diyetkolik.com, fitekran.com, fatsecret.com.tr,
türkomp/tarimorman.gov.tr, nefisyemektarifleri.com gibi Türkçe beslenme
kaynakları) araştırılıp USDA FoodData Central'daki bilinen standart
değerlerle çapraz kontrol edilerek belirlendi (2026-07-30).

`seed_catalogs.py`'den farklı olarak bu girdiler `data_sources/usda/` (USDA
kaynaklı, gitignore'lu) pipeline'ının bir parçası değil — doğrudan bu
script'te sabit kodlu, çünkü USDA'da karşılığı olmayan/kötü temsil edilen
Türk mutfağı besinleri. `fdc_id` ile upsert (idempotent, `seed_catalogs.py`
ile aynı desen) — tekrar çalıştırmak veri tekrarına yol açmaz.

Kullanım:
    python -m scripts.seed_tr_foods
"""

from app.db.session import SessionLocal
from app.models.food_catalog import FoodCatalog

# (fdc_id, name_tr, name_en, category_tr, kcal, protein_g, carbs_g, fat_g, fiber_g)
# fdc_id'ler KALICI/SABİT — sıra değişse ya da bir madde silinse bile diğer
# kayıtların kimliği bozulmasın diye enumerate index'i DEĞİL, elle atanmış
# sabit ID kullanılıyor (9_000_001'den başlayan aralık, gerçek USDA fdc_id'lerle
# çakışmaz). "Ispanak, çiğ" bilerek YOK — kataloğunda zaten doğru değerlerle
# mevcuttu (id 488, sr_legacy_food), sadece "Ispanak, haşlanmış" eksikti.
FOODS = [
    (9_000_001, "Tavuk göğsü, çiğ (derisiz)", "Chicken breast, raw, skinless", "Kanatlı Eti Ürünleri", 120.0, 22.5, 0.0, 2.6, 0.0),
    (9_000_002, "Tavuk göğsü, ızgara (pişmiş, derisiz)", "Chicken breast, grilled, skinless", "Kanatlı Eti Ürünleri", 165.0, 31.0, 0.0, 3.6, 0.0),
    (9_000_003, "Kırmızı mercimek, çiğ", "Red lentils, raw", "Baklagiller", 352.0, 24.6, 63.4, 1.1, 10.7),
    (9_000_004, "Kırmızı mercimek, haşlanmış", "Red lentils, boiled", "Baklagiller", 116.0, 9.0, 20.1, 0.4, 7.9),
    (9_000_005, "Yeşil mercimek, çiğ", "Green lentils, raw", "Baklagiller", 353.0, 25.8, 60.1, 1.1, 10.7),
    (9_000_006, "Yeşil mercimek, haşlanmış", "Green lentils, boiled", "Baklagiller", 116.0, 9.0, 20.1, 0.4, 7.9),
    (9_000_007, "Pirinç (beyaz), çiğ", "White rice, raw", "Tahıllar ve Makarna", 365.0, 7.1, 80.0, 0.7, 1.3),
    (9_000_008, "Pirinç (beyaz), haşlanmış (pilav, sade)", "White rice, boiled (plain pilaf)", "Tahıllar ve Makarna", 130.0, 2.7, 28.2, 0.3, 0.4),
    (9_000_009, "Ton balığı, konserve (suda, süzülmüş)", "Tuna, canned in water, drained", "Balık ve Deniz Ürünleri", 116.0, 25.5, 0.0, 0.8, 0.0),
    (9_000_010, "Ton balığı, konserve (zeytinyağında, süzülmüş)", "Tuna, canned in olive oil, drained", "Balık ve Deniz Ürünleri", 189.0, 25.0, 0.0, 8.2, 0.0),
    (9_000_011, "Somon fileto, ızgara/fırınlanmış", "Salmon fillet, grilled/baked", "Balık ve Deniz Ürünleri", 206.0, 22.1, 0.0, 12.4, 0.0),
    (9_000_012, "Yumurta, haşlanmış (bütün)", "Egg, whole, hard-boiled", "Süt Ürünleri ve Yumurta", 155.0, 12.6, 1.1, 10.6, 0.0),
    (9_000_013, "Yumurta, çiğ (bütün, kabuksuz)", "Egg, whole, raw", "Süt Ürünleri ve Yumurta", 143.0, 12.6, 0.7, 9.5, 0.0),
    (9_000_014, "Beyaz peynir (Türk tipi, tam yağlı)", "Turkish white cheese (feta-style), full-fat", "Süt Ürünleri ve Yumurta", 309.0, 20.4, 2.5, 24.3, 0.0),
    (9_000_015, "Kaşar peyniri (tam yağlı)", "Kashar cheese, full-fat", "Süt Ürünleri ve Yumurta", 353.0, 27.0, 2.6, 26.6, 0.0),
    (9_000_016, "Lor peyniri (az yağlı)", "Lor cheese (Turkish curd cheese), low-fat", "Süt Ürünleri ve Yumurta", 98.0, 13.0, 3.0, 4.0, 0.0),
    (9_000_017, "Süt (tam yağlı)", "Milk, whole", "Süt Ürünleri ve Yumurta", 62.0, 3.33, 5.42, 3.33, 0.0),
    (9_000_018, "Yoğurt (tam yağlı)", "Yogurt, plain, whole milk", "Süt Ürünleri ve Yumurta", 61.0, 3.47, 4.66, 3.25, 0.0),
    (9_000_019, "Yoğurt, süzme (tam yağlı)", "Strained yogurt (Greek-style), whole milk", "Süt Ürünleri ve Yumurta", 120.0, 7.12, 1.58, 9.44, 0.0),
    (9_000_020, "Ayran", "Ayran (yogurt drink)", "İçecekler", 37.0, 1.98, 2.71, 2.0, 0.0),
    (9_000_021, "Zeytinyağı", "Olive oil", "Yağlar", 884.0, 0.0, 0.0, 100.0, 0.0),
    (9_000_022, "Fındık, çiğ", "Hazelnuts, raw", "Kuruyemiş ve Tohumlar", 628.0, 14.9, 16.7, 60.8, 9.7),
    (9_000_023, "Nohut, haşlanmış", "Chickpeas, boiled", "Baklagiller", 164.0, 8.9, 27.4, 2.6, 7.6),
    (9_000_024, "Kuru fasulye (beyaz), haşlanmış", "White beans, boiled", "Baklagiller", 140.0, 8.2, 26.1, 0.6, 10.5),
    (9_000_025, "Ispanak, haşlanmış", "Spinach, boiled", "Sebzeler", 23.0, 3.0, 3.8, 0.3, 2.4),
    (9_000_026, "Dana kıyma, çiğ", "Ground veal/beef, raw", "Kuzu, Dana ve Av Eti Ürünleri", 202.0, 18.65, 0.5, 13.6, 0.0),
    (9_000_027, "Dana kıyma, pişmiş", "Ground veal/beef, cooked", "Kuzu, Dana ve Av Eti Ürünleri", 212.0, 26.5, 0.0, 11.2, 0.0),
    (9_000_028, "Simit (susamlı)", "Simit (Turkish sesame bread ring)", "Fırın Ürünleri", 275.0, 10.7, 57.1, 3.6, 2.5),
    (9_000_029, "Tam buğday ekmeği", "Whole wheat bread", "Fırın Ürünleri", 252.0, 12.45, 42.71, 3.5, 6.0),

    # --- Hazır yemekler/tarifler (2026-07-31 eklendi) ---
    # Bunlar HAM besin değil, pişmiş/hazır Türk mutfağı yemekleri (yukarıdakiler
    # ham/tekil besindi). Değerler fitekran.com + en az bir ikinci bağımsız
    # kaynak (diyetkolik.com, haberturk.com, dytseydaertas.com, besinanaliz.com)
    # karşılaştırılıp belirlendi. Kaynaklar arası >2x fark olan yemekler (ör.
    # ezogelin çorbası, karnıyarık, mantı, sütlaç, menemen, sucuk, cacık,
    # imam bayıldı) GÜVENİLMEZ bulunup BİLEREK eklenmedi — tahmini/uydurma
    # değer yazılmadı.
    (9_000_030, "Çiğ köfte (etsiz)", "Vegan çiğ köfte (bulgur-based)", "Aperatifler ve Mezeler", 181.0, 4.6, 32.9, 4.0, 4.3),
    (9_000_031, "Mercimek çorbası", "Red lentil soup", "Çorbalar", 46.0, 2.5, 8.3, 0.2, 1.8),
    (9_000_032, "Lahmacun", "Lahmacun (Turkish flatbread)", "Fırın Ürünleri", 226.0, 7.5, 24.5, 6.75, 2.05),
    (9_000_033, "Adana kebap", "Adana kebab", "Kuzu, Dana ve Av Eti Ürünleri", 239.0, 13.9, 1.06, 19.4, 0.6),
    (9_000_034, "Izgara köfte", "Grilled meatballs", "Kuzu, Dana ve Av Eti Ürünleri", 184.0, 15.6, 4.7, 11.1, 0.75),
    (9_000_035, "Kaşarlı pide", "Kashar cheese pide", "Fırın Ürünleri", 240.0, 7.9, 27.6, 10.7, 1.9),
    (9_000_036, "Kıymalı pide", "Ground meat pide", "Fırın Ürünleri", 209.0, 8.2, 24.5, 8.5, 1.6),
    (9_000_037, "Fıstıklı baklava", "Pistachio baklava", "Tatlılar", 329.0, 3.0, 46.0, 13.9, 0.5),
    (9_000_038, "Künefe", "Künefe (kunafa)", "Tatlılar", 253.0, 3.8, 26.6, 13.3, 0.7),
    (9_000_039, "Pastırma", "Pastırma (cured beef)", "Kuzu, Dana ve Av Eti Ürünleri", 250.0, 29.5, 0.0, 13.9, 0.0),
    (9_000_040, "Siyah zeytin", "Black olives", "Yağlar", 207.0, 1.8, 1.1, 21.0, 0.0),
    # 9_000_041 (Bal) kasıtlı olarak yok — katalogda zaten "Bal" (id 169640,
    # sr_legacy_food, 304 kcal) var, araştırdığımız 307 kcal değeri ona çok
    # yakın; kopya eklemek yerine mevcut kayıt kullanılıyor.
    (9_000_042, "Tahin", "Tahini (sesame paste)", "Yağlar", 583.0, 17.8, 21.2, 48.0, 5.0),
    (9_000_043, "Üzüm pekmezi", "Grape molasses", "Şekerlemeler ve Tatlandırıcılar", 242.0, 1.1, 59.3, 0.0, 0.2),
    (9_000_044, "Humus", "Hummus", "Aperatifler ve Mezeler", 242.0, 5.9, 13.5, 17.8, 5.6),
    (9_000_045, "Peynirli poğaça", "Cheese pastry (poğaça)", "Fırın Ürünleri", 391.0, 8.7, 30.6, 26.1, 1.7),
    (9_000_046, "Kısır", "Kısır (bulgur salad)", "Tahıllar ve Makarna", 162.0, 4.2, 28.8, 3.4, 3.9),
]


def seed_tr_foods() -> int:
    db = SessionLocal()
    try:
        existing_ids = {row.fdc_id for row in db.query(FoodCatalog.fdc_id).all()}
        count = 0
        for fdc_id, name_tr, name_en, category_tr, kcal, protein, carbs, fat, fiber in FOODS:
            values = dict(
                name_en=name_en,
                name_tr=name_tr,
                data_type="tr_curated",
                category_tr=category_tr,
                calories_kcal=kcal,
                protein_g=protein,
                carbs_g=carbs,
                fat_g=fat,
                fiber_g=fiber,
                is_translated=False,
            )
            if fdc_id in existing_ids:
                db.query(FoodCatalog).filter(FoodCatalog.fdc_id == fdc_id).update(values)
            else:
                db.add(FoodCatalog(fdc_id=fdc_id, **values))
            count += 1
        db.commit()
        return count
    finally:
        db.close()


if __name__ == "__main__":
    n = seed_tr_foods()
    print(f"[food_catalog] {n} Türk mutfağı besini seed edildi (upsert)")
