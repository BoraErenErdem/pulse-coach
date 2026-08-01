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

# (fdc_id, name_tr, name_en, category_tr, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg)
# fdc_id'ler KALICI/SABİT — sıra değişse ya da bir madde silinse bile diğer
# kayıtların kimliği bozulmasın diye enumerate index'i DEĞİL, elle atanmış
# sabit ID kullanılıyor (9_000_001'den başlayan aralık, gerçek USDA fdc_id'lerle
# çakışmaz). "Ispanak, çiğ" bilerek YOK — kataloğunda zaten doğru değerlerle
# mevcuttu (id 488, sr_legacy_food), sadece "Ispanak, haşlanmış" eksikti.
#
# sugar_g/sodium_mg (2026-08-01 eklendi): güvenilir kaynak bulunamayan
# besinlerde None bırakıldı (tahmini/uydurma değer yazılmadı) — özellikle
# çok bileşenli hazır yemeklerde bu iki değer kaynaklarda ya hiç yok ya da
# tutarsız. Basit/tekil besinlerde (et, yağ, tahıl vb.) doğal olarak sıfıra
# çok yakın olanlar (ör. zeytinyağı şekeri) için 0.0 kullanıldı.
FOODS = [
    (9_000_001, "Tavuk göğsü, çiğ (derisiz)", "Chicken breast, raw, skinless", "Kanatlı Eti Ürünleri", 120.0, 22.5, 0.0, 2.6, 0.0, 0.0, None),
    (9_000_002, "Tavuk göğsü, ızgara (pişmiş, derisiz)", "Chicken breast, grilled, skinless", "Kanatlı Eti Ürünleri", 165.0, 31.0, 0.0, 3.6, 0.0, 0.0, None),
    (9_000_003, "Kırmızı mercimek, çiğ", "Red lentils, raw", "Baklagiller", 352.0, 24.6, 63.4, 1.1, 10.7, None, None),
    (9_000_004, "Kırmızı mercimek, haşlanmış", "Red lentils, boiled", "Baklagiller", 116.0, 9.0, 20.1, 0.4, 7.9, None, None),
    (9_000_005, "Yeşil mercimek, çiğ", "Green lentils, raw", "Baklagiller", 353.0, 25.8, 60.1, 1.1, 10.7, None, None),
    (9_000_006, "Yeşil mercimek, haşlanmış", "Green lentils, boiled", "Baklagiller", 116.0, 9.0, 20.1, 0.4, 7.9, None, None),
    (9_000_007, "Pirinç (beyaz), çiğ", "White rice, raw", "Tahıllar ve Makarna", 365.0, 7.1, 80.0, 0.7, 1.3, None, None),
    # İsim BİLEREK "Pirinç pilavı (sade)" olarak kısa/doğal tutuldu (eski adı
    # "Pirinç (beyaz), haşlanmış (pilav, sade)" idi) — 2026-08-01'de "Şehriyeli
    # pirinç pilavı" eklenince fuzzy-match'in "sorgunun tüm kelimelerini içeren
    # EN KISA kayıt" kuralı yüzünden "pirinç pilavı" araması yanlışlıkla o
    # şehriyeli varyanta gidiyordu (o isim daha kısaydı) — bu yeniden adlandırma
    # "pirinç pilavı" sorgusuyla doğrudan (starts-with) eşleşip sorunu çözüyor.
    (9_000_008, "Pirinç pilavı (sade)", "White rice, boiled (plain pilaf)", "Tahıllar ve Makarna", 130.0, 2.7, 28.2, 0.3, 0.4, None, None),
    (9_000_009, "Ton balığı, konserve (suda, süzülmüş)", "Tuna, canned in water, drained", "Balık ve Deniz Ürünleri", 116.0, 25.5, 0.0, 0.8, 0.0, 0.0, None),
    (9_000_010, "Ton balığı, konserve (zeytinyağında, süzülmüş)", "Tuna, canned in olive oil, drained", "Balık ve Deniz Ürünleri", 189.0, 25.0, 0.0, 8.2, 0.0, 0.0, None),
    (9_000_011, "Somon fileto, ızgara/fırınlanmış", "Salmon fillet, grilled/baked", "Balık ve Deniz Ürünleri", 206.0, 22.1, 0.0, 12.4, 0.0, 0.0, None),
    (9_000_012, "Yumurta, haşlanmış (bütün)", "Egg, whole, hard-boiled", "Süt Ürünleri ve Yumurta", 155.0, 12.6, 1.1, 10.6, 0.0, None, None),
    (9_000_013, "Yumurta, çiğ (bütün, kabuksuz)", "Egg, whole, raw", "Süt Ürünleri ve Yumurta", 143.0, 12.6, 0.7, 9.5, 0.0, None, None),
    # sodium_mg (2026-08-01): diyetkolik.com'un beyaz peynir/kaşar peyniri
    # sayfalarından alındı (beyaz peynir 252mg, kaşar 710mg — kaşarın çok
    # daha yüksek olması, olgunlaştırma sürecinde suyun uçup tuzun
    # yoğunlaşmasıyla tutarlı, gıda bilimi açısından mantıklı).
    (9_000_014, "Beyaz peynir (Türk tipi, tam yağlı)", "Turkish white cheese (feta-style), full-fat", "Süt Ürünleri ve Yumurta", 309.0, 20.4, 2.5, 24.3, 0.0, None, 252.0),
    (9_000_015, "Kaşar peyniri (tam yağlı)", "Kashar cheese, full-fat", "Süt Ürünleri ve Yumurta", 353.0, 27.0, 2.6, 26.6, 0.0, None, 710.0),
    (9_000_016, "Lor peyniri (az yağlı)", "Lor cheese (Turkish curd cheese), low-fat", "Süt Ürünleri ve Yumurta", 98.0, 13.0, 3.0, 4.0, 0.0, None, None),
    (9_000_017, "Süt (tam yağlı)", "Milk, whole", "Süt Ürünleri ve Yumurta", 62.0, 3.33, 5.42, 3.33, 0.0, None, None),
    (9_000_018, "Yoğurt (tam yağlı)", "Yogurt, plain, whole milk", "Süt Ürünleri ve Yumurta", 61.0, 3.47, 4.66, 3.25, 0.0, None, None),
    (9_000_019, "Yoğurt, süzme (tam yağlı)", "Strained yogurt (Greek-style), whole milk", "Süt Ürünleri ve Yumurta", 120.0, 7.12, 1.58, 9.44, 0.0, None, None),
    (9_000_020, "Ayran", "Ayran (yogurt drink)", "İçecekler", 37.0, 1.98, 2.71, 2.0, 0.0, None, None),
    (9_000_021, "Zeytinyağı", "Olive oil", "Yağlar", 884.0, 0.0, 0.0, 100.0, 0.0, 0.0, 0.0),
    (9_000_022, "Fındık, çiğ", "Hazelnuts, raw", "Kuruyemiş ve Tohumlar", 628.0, 14.9, 16.7, 60.8, 9.7, None, None),
    (9_000_023, "Nohut, haşlanmış", "Chickpeas, boiled", "Baklagiller", 164.0, 8.9, 27.4, 2.6, 7.6, None, None),
    (9_000_024, "Kuru fasulye (beyaz), haşlanmış", "White beans, boiled", "Baklagiller", 140.0, 8.2, 26.1, 0.6, 10.5, None, None),
    (9_000_025, "Ispanak, haşlanmış", "Spinach, boiled", "Sebzeler", 23.0, 3.0, 3.8, 0.3, 2.4, None, None),
    (9_000_026, "Dana kıyma, çiğ", "Ground veal/beef, raw", "Kuzu, Dana ve Av Eti Ürünleri", 202.0, 18.65, 0.5, 13.6, 0.0, None, None),
    (9_000_027, "Dana kıyma, pişmiş", "Ground veal/beef, cooked", "Kuzu, Dana ve Av Eti Ürünleri", 212.0, 26.5, 0.0, 11.2, 0.0, None, None),
    (9_000_028, "Simit (susamlı)", "Simit (Turkish sesame bread ring)", "Fırın Ürünleri", 275.0, 10.7, 57.1, 3.6, 2.5, None, None),
    (9_000_029, "Tam buğday ekmeği", "Whole wheat bread", "Fırın Ürünleri", 252.0, 12.45, 42.71, 3.5, 6.0, None, None),

    # --- Hazır yemekler/tarifler (2026-07-31 eklendi) ---
    # Bunlar HAM besin değil, pişmiş/hazır Türk mutfağı yemekleri (yukarıdakiler
    # ham/tekil besindi). Değerler fitekran.com + en az bir ikinci bağımsız
    # kaynak (diyetkolik.com, haberturk.com, dytseydaertas.com, besinanaliz.com)
    # karşılaştırılıp belirlendi. Kaynaklar arası >2x fark olan yemekler (ör.
    # ezogelin çorbası, karnıyarık, mantı, sütlaç, menemen, sucuk, cacık,
    # imam bayıldı) GÜVENİLMEZ bulunup BİLEREK eklenmedi — tahmini/uydurma
    # değer yazılmadı.
    (9_000_030, "Çiğ köfte (etsiz)", "Vegan çiğ köfte (bulgur-based)", "Aperatifler ve Mezeler", 181.0, 4.6, 32.9, 4.0, 4.3, None, None),
    (9_000_031, "Mercimek çorbası", "Red lentil soup", "Çorbalar", 46.0, 2.5, 8.3, 0.2, 1.8, None, None),
    (9_000_032, "Lahmacun", "Lahmacun (Turkish flatbread)", "Fırın Ürünleri", 226.0, 7.5, 24.5, 6.75, 2.05, None, None),
    (9_000_033, "Adana kebap", "Adana kebab", "Kuzu, Dana ve Av Eti Ürünleri", 239.0, 13.9, 1.06, 19.4, 0.6, None, None),
    (9_000_034, "Izgara köfte", "Grilled meatballs", "Kuzu, Dana ve Av Eti Ürünleri", 184.0, 15.6, 4.7, 11.1, 0.75, None, None),
    (9_000_035, "Kaşarlı pide", "Kashar cheese pide", "Fırın Ürünleri", 240.0, 7.9, 27.6, 10.7, 1.9, None, None),
    (9_000_036, "Kıymalı pide", "Ground meat pide", "Fırın Ürünleri", 209.0, 8.2, 24.5, 8.5, 1.6, None, None),
    (9_000_037, "Fıstıklı baklava", "Pistachio baklava", "Tatlılar", 329.0, 3.0, 46.0, 13.9, 0.5, None, None),
    (9_000_038, "Künefe", "Künefe (kunafa)", "Tatlılar", 253.0, 3.8, 26.6, 13.3, 0.7, None, None),
    # 9_000_039 (Pastırma, 250 kcal) kasıtlı olarak KALDIRILDI (2026-08-01) —
    # aşağıda diyetkolik.com'dan araştırılan 9_000_080 ile AYNI isim altında
    # çakışıyordu (fuzzy-match'in "domates/domates tozu" bug'ına benzer bir
    # belirsizlik yaratırdı); kullanıcının "bundan sonra diyetkolik" kararı
    # gereği diyetkolik değeri (268 kcal) tutuldu, bu satır silindi.
    (9_000_040, "Siyah zeytin", "Black olives", "Yağlar", 207.0, 1.8, 1.1, 21.0, 0.0, None, None),
    # 9_000_041 (Bal) kasıtlı olarak yok — katalogda zaten "Bal" (id 169640,
    # sr_legacy_food, 304 kcal) var, araştırdığımız 307 kcal değeri ona çok
    # yakın; kopya eklemek yerine mevcut kayıt kullanılıyor.
    (9_000_042, "Tahin", "Tahini (sesame paste)", "Yağlar", 583.0, 17.8, 21.2, 48.0, 5.0, None, None),
    (9_000_043, "Üzüm pekmezi", "Grape molasses", "Şekerlemeler ve Tatlandırıcılar", 242.0, 1.1, 59.3, 0.0, 0.2, None, None),
    (9_000_044, "Humus", "Hummus", "Aperatifler ve Mezeler", 242.0, 5.9, 13.5, 17.8, 5.6, None, None),
    (9_000_045, "Peynirli poğaça", "Cheese pastry (poğaça)", "Fırın Ürünleri", 391.0, 8.7, 30.6, 26.1, 1.7, None, None),
    (9_000_046, "Kısır", "Kısır (bulgur salad)", "Tahıllar ve Makarna", 162.0, 4.2, 28.8, 3.4, 3.9, None, None),

    # --- Makarna/pilav varyantları (2026-08-01 eklendi, kullanıcı isteğiyle) ---
    # Makarna: USDA ham verisinden ("Pasta, cooked, enriched, with added
    # salt", fdc_id 169751 — zaten indirilmiş data_sources/usda dosyasından
    # doğrudan okundu) + diyetkolik.com'un genel "Makarna" sayfası (157 kcal)
    # ile çapraz kontrol edildi, ikisi TAM örtüşüyor. Kataloğda önceden
    # sadece ÇİĞ makarna (id 713) ve sebzeli/ıspanaklı pişmiş varyantlar
    # vardı, SADE pişmiş makarna eksikti.
    (9_000_047, "Makarna, haşlanmış (sade)", "Pasta, cooked, enriched", "Tahıllar ve Makarna", 157.0, 5.8, 30.6, 0.93, 1.8, 0.56, 131.0),
    # Şehriyeli pirinç pilavı: fitekran.com/diyetkolik.com (171 kcal, aynı
    # veritabanını paylaşıyorlar) + birden fazla bağımsız sayfada (sabah.com.tr,
    # ye-mek.net, izgazete.net) tekrarlanan aynı değerle destekleniyor.
    (9_000_048, "Şehriyeli pirinç pilavı", "Rice pilaf with vermicelli", "Tahıllar ve Makarna", 171.0, 3.16, 30.69, 3.74, 0.81, None, None),
    # Bulgur pilavı (sade, Türk usulü yağlı pilav) — mevcut "Bulgur, pişmiş"
    # (id 998, sade haşlama, ~83 kcal) İLE AYNI DEĞİL: bu, tereyağı/yağ ile
    # pişirilen tipik Türk pilavı, birden fazla kaynakta (diyetkolik.com,
    # fitekran.com, ntv.com.tr) tutarlı şekilde 114 kcal.
    (9_000_049, "Bulgur pilavı (sade)", "Bulgur pilaf, plain (Turkish-style)", "Tahıllar ve Makarna", 114.0, 2.78, 18.19, 3.39, 2.98, None, None),

    # --- Tatlılar (2026-08-01 eklendi, kullanıcı isteğiyle) ---
    # Türk mutfağı ağırlıklı + birkaç yabancı mutfak tatlısı araştırıldı.
    # Bu turda özellikle şerbetli/çok bileşenli Türk tatlıları (sütlaç,
    # revani, şekerpare, lokma tatlısı, kabak tatlısı, aşure) kaynaklar arası
    # >2x fark (bazen 2.7x'e kadar) gösterdiği için BİLEREK EKLENMEDİ —
    # fitekran.com/diyetkolik.com bir küme, haberturk.com/ntv.com.tr ayrı bir
    # küme oluşturup şerbetli tatlılarda sistematik olarak birbirinden çok
    # uzaklaşıyor (muhtemelen farklı porsiyon/tarif varsayımları). Aşağıdaki
    # 8 tatlı, en az 2 GERÇEKTEN bağımsız kaynakla (aynı veritabanını
    # paylaşan fitekran+diyetkolik TEK kaynak sayıldı) çapraz kontrol edilip
    # tutarlı bulundu.
    (9_000_050, "Kazandibi", "Kazandibi (caramelized milk pudding)", "Tatlılar", 130.0, 3.16, 19.39, 3.73, 0.19, None, None),
    # Güllaç: diyetkolik.com VE ayrı bir sorguda tekrar teyit edilen 143 kcal
    # değeri, hiçbir kaynakta çelişmedi (haberturk.com'un detaylı besin
    # tablosuyla aynı rakamı verdi — nadir bir tam örtüşme).
    (9_000_051, "Güllaç", "Güllaç (rosewater milk dessert)", "Tatlılar", 143.0, 3.55, 21.70, 4.83, 0.44, None, 35.20),
    (9_000_052, "Tel kadayıf tatlısı (cevizli)", "Walnut shredded phyllo dessert (tel kadayıf)", "Tatlılar", 297.0, 5.77, 43.6, 18.99, 1.29, None, None),
    # Cevizli baklava: mevcut "Fıstıklı baklava" (9_000_037, 329 kcal) ile
    # aynı kaynak kümesinden, tutarlı bir aralıkta (285 kcal).
    (9_000_053, "Cevizli baklava", "Walnut baklava", "Tatlılar", 285.0, 2.59, 37.3, 12.24, 0.57, None, None),
    # İrmik helvası: diyetkolik.com VE haberturk.com/ntv.com.tr TAM olarak
    # aynı değeri (532 kcal) veriyor — bu turun en güvenilir sonucu.
    (9_000_054, "İrmik helvası", "Semolina halva (irmik helvası)", "Tatlılar", 532.0, 7.77, 64.89, 25.23, 0.0, None, 32.71),
    # Tiramisu: diyetkolik.com (223 kcal) ve fatsecret.com.tr'nin genel
    # "Tiramisu" girdisi (283 kcal) aynı büyüklük mertebesinde (1.27x) —
    # marka-özel ürünler (ör. Ülker Olala Tiramisu, 398 kcal) hariç tutuldu.
    (9_000_055, "Tiramisu", "Tiramisu", "Tatlılar", 223.0, 5.37, 32.94, 6.5, 0.79, None, 128.61),
    # Cheesecake (New York usulü): nutribit.app/myfooddata.com (uluslararası,
    # ~314-320 kcal) ile fitekran.com'daki Türk cheesecake çeşitleri
    # (limonlu/frambuazlı/incirli, 262-344 kcal) aynı aralıkta.
    (9_000_056, "Cheesecake (New York usulü)", "New York style cheesecake", "Tatlılar", 314.0, 4.9, 32.4, 18.6, None, 22.0, 390.0),
    # Brownie: diyetkolik.com (319 kcal) ve haberturk.com'un "Genel Brownie"
    # değeri (414 kcal) 1.30x fark — eşiğin altında, kabul edilebilir.
    (9_000_057, "Brownie", "Chocolate brownie", "Tatlılar", 319.0, 2.97, 43.2, 14.19, 0.54, None, 150.24),

    # 2026-08-01: fotoğraf analizi (gemma4:12b) canlı test turunda ortaya
    # çıkan gerçek katalog boşlukları — 4'ü de USDA SR Legacy ham JSON'unda
    # (data_sources/usda/FoodData_Central_sr_legacy_food_json_2018-04.json)
    # MEVCUT ama curate_food_subset.py'nin gruplama/uzunluk-bazlı seçim
    # algoritması yüzünden küratörlü alt kümeye HİÇ girmemiş (ör. kırmızı
    # domates "Tomatoes, red, ripe, raw, year round average" açıklaması
    # yeşil/sarı/turuncu varyantlardan daha UZUN olduğu için 3'lük grup
    # limitinde elendi — ironik şekilde en yaygın domates türü kayboldu).
    # Değerler doğrudan bu ham JSON'dan alındı (fdc_id'ler gerçek USDA
    # id'leri, ama proje kuralı gereği 9_000_0XX aralığında yeniden atandı).
    (9_000_058, "Domates, çiğ", "Tomatoes, red, ripe, raw", "Sebzeler", 18.0, 0.88, 3.89, 0.2, 1.2, 2.63, 5.0),
    (9_000_059, "Yulaf ezmesi, pişmiş", "Oats, cooked with water, without salt", "Tahıllar ve Makarna", 71.0, 2.54, 12.0, 1.52, 1.7, 0.27, 4.0),
    (9_000_060, "Chia tohumu", "Chia seeds, dried", "Kuruyemiş ve Tohumlar", 486.0, 16.5, 42.1, 30.7, 34.4, None, 16.0),
    (9_000_061, "Badem, çiğ", "Almonds, raw", "Kuruyemiş ve Tohumlar", 579.0, 21.2, 21.6, 49.9, 12.5, 4.35, 1.0),
    # "Bal" (fdc_id 1999) kataloğunda var ama sadece "Pastırma, bal,
    # fümelenmiş, pişmiş" (bal kürlü/tütsülü pastırma) — alakasız bir et
    # ürünü, düz bal hiç yoktu. USDA'da fdc_id 169640 "Honey".
    (9_000_062, "Bal", "Honey", "Tatlılar", 304.0, 0.3, 82.4, 0.0, 0.2, 82.1, 4.0),

    # 2026-08-01 (aynı gün, üçüncü ekleme turu): Kullanıcı isteğiyle katalogdaki
    # ~2076 USDA-kökenli (sr_legacy_food) kayıt TAMAMEN SİLİNDİ, sadece bu
    # dosyadaki tr_curated kayıtlar kaldı — kullanıcı bundan sonra besin
    # verilerinin SADECE diyetkolik.com'dan çekilmesini istedi. Bu blok
    # tamamen diyetkolik.com'dan araştırıldı (fitekran/fatsecret/USDA çapraz
    # kontrolü YOK, önceki bloklardan farklı olarak). Her değer, o besinin
    # diyetkolik sayfasında verilen kcal ile makrolardan hesaplanan kcal'in
    # (4×protein + 4×karbonhidrat + 9×yağ) makul bir toleransta (~%15)
    # örtüştüğü doğrulandıktan sonra eklendi; örtüşmeyenler (ör. "haşlanmış
    # brokoli" 9kcal/100g verdi ama kendi makrolarından ~22kcal çıkıyordu,
    # "kırmızı lahana" sadece "1 bardak" porsiyon değeri verdi, "un" tam
    # makro kırılımı yoktu) GÜVENİLİR OLMADIĞI için hiç eklenmedi. "Kuru
    # nohut"/"kuru fasulye" bilerek YOK — kataloğunda zaten yakın değerlerle
    # mevcut (id 9_000_023/9_000_024), yeni bir neredeyse-aynı kayıt eklemek
    # bugünkü "domates/domates tozu" fuzzy-match bug'ına benzer yeni bir
    # belirsizlik kaynağı yaratabilirdi. "Ispanak, çiğ" bu turda YENİDEN
    # eklendi çünkü yukarıdaki 29. satırın notu artık geçersiz — o zamanki
    # kaynak (id 488, sr_legacy_food) bu toplu silmede gitti.
    (9_000_063, "Ispanak, çiğ", "Spinach, raw", "Sebzeler", 17.0, 2.52, 0.55, 0.3, 2.58, None, None),
    (9_000_064, "Elma, çiğ", "Apple, raw", "Meyveler ve Meyve Suları", 52.0, 0.26, 13.81, 0.17, 2.4, None, None),
    (9_000_065, "Karpuz, çiğ", "Watermelon, raw", "Meyveler ve Meyve Suları", 30.0, 0.6, 7.5, 0.15, 0.4, None, 1.0),
    (9_000_066, "Çilek, çiğ", "Strawberry, raw", "Meyveler ve Meyve Suları", 32.0, 0.67, 7.68, 0.3, 2.0, None, None),
    (9_000_067, "Üzüm, çiğ", "Grapes, raw", "Meyveler ve Meyve Suları", 69.0, 0.7, 15.6, 0.3, 0.8, None, None),
    (9_000_068, "Kayısı, çiğ", "Apricot, raw", "Meyveler ve Meyve Suları", 48.0, 1.4, 11.12, 0.39, 2.0, None, None),
    (9_000_069, "Şeftali, çiğ", "Peach, raw", "Meyveler ve Meyve Suları", 39.0, 0.91, 9.54, 0.25, 1.5, None, None),
    (9_000_070, "Portakal, çiğ", "Orange, raw", "Meyveler ve Meyve Suları", 46.0, 0.7, 11.54, 0.21, 2.4, None, None),
    (9_000_071, "Armut, çiğ", "Pear, raw", "Meyveler ve Meyve Suları", 57.0, 0.36, 15.23, 0.14, 3.1, None, None),
    (9_000_072, "Kiraz, çiğ", "Cherry, raw", "Meyveler ve Meyve Suları", 63.0, 1.06, 16.01, 0.2, 2.1, None, None),
    (9_000_073, "Nar, çiğ", "Pomegranate, raw", "Meyveler ve Meyve Suları", 83.0, 1.67, 18.7, 1.17, 4.0, None, None),
    (9_000_074, "Marul, çiğ", "Lettuce, raw", "Sebzeler", 16.0, 0.9, 1.7, 0.2, 1.3, None, None),
    (9_000_075, "Dana eti, pişmiş (yarım yağlı)", "Beef, cooked, medium fat", "Kuzu, Dana ve Av Eti Ürünleri", 187.0, 18.88, 0.0, 12.52, 0.0, None, None),
    (9_000_076, "Dana eti, pişmiş (yağsız)", "Beef, cooked, lean", "Kuzu, Dana ve Av Eti Ürünleri", 251.0, 30.8, 0.0, 13.19, 0.0, None, None),
    (9_000_077, "Kuzu eti, pişmiş", "Lamb, cooked", "Kuzu, Dana ve Av Eti Ürünleri", 220.0, 32.75, 2.5, 8.9, 0.0, None, None),
    (9_000_078, "Hindi göğsü, pişmiş (derisiz)", "Turkey breast, cooked, skinless", "Kanatlı Eti Ürünleri", 136.0, 29.51, 0.0, 1.79, 0.0, None, None),
    (9_000_079, "Sucuk (yağlı)", "Sucuk (Turkish sausage), regular fat", "Kuzu, Dana ve Av Eti Ürünleri", 331.0, 14.23, 5.14, 28.38, None, None, None),
    (9_000_080, "Pastırma", "Pastırma (Turkish cured beef)", "Kuzu, Dana ve Av Eti Ürünleri", 268.0, 28.0, 3.0, 16.0, None, None, None),
    (9_000_081, "Levrek", "Sea bass", "Balık ve Deniz Ürünleri", 97.0, 18.43, 0.0, 2.0, 0.0, None, None),
    (9_000_082, "Çipura", "Gilt-head bream", "Balık ve Deniz Ürünleri", 96.0, 19.6, 0.0, 1.9, 0.0, None, None),
    (9_000_083, "Hamsi", "Anchovy", "Balık ve Deniz Ürünleri", 115.0, 17.0, 0.0, 5.0, 0.0, None, None),
    (9_000_084, "Alabalık", "Trout", "Balık ve Deniz Ürünleri", 168.0, 18.3, 0.0, 10.0, 0.0, None, None),
    # Fat değeri diyetkolik'in "İnce Bulgur" sayfasında verilmemişti; aynı
    # sitedeki "Duru Bulgur (Pişmemiş)" sayfasından (1.4g) ödünç alındı —
    # ikisi de aynı ürün (çiğ ince bulgur), kcal/karbonhidrat/protein değerleri
    # birbirine çok yakındı.
    (9_000_085, "Bulgur, çiğ", "Bulgur, raw", "Tahıllar ve Makarna", 355.0, 10.9, 78.6, 1.4, 3.0, None, None),
    # 9_000_086 (Makarna, pişmiş) kasıtlı olarak YOK — mevcut "Makarna,
    # haşlanmış (sade)" (9_000_047) diyetkolik'ten aldığım değerlerle
    # (157 kcal, 5.8p, 30.6c, 0.93f) neredeyse birebir aynı ve o kayıt ayrıca
    # şeker/sodyum içeriyor (bu araştırmada elde edemediğim) — aynı kavram
    # için ikinci bir kayıt eklemek "domates/domates tozu" bug'ındaki gibi
    # bir fuzzy-match belirsizliği yaratırdı.
    (9_000_087, "Buğday unu (tam buğday)", "Whole wheat flour", "Tahıllar ve Makarna", 340.0, 13.21, 71.97, 2.5, 10.7, None, None),
    (9_000_088, "Tereyağı", "Butter", "Yağlar", 717.0, 0.85, 0.06, 81.11, 0.0, 0.06, None),
    # Ceviz: diyetkolik kalori (654) ve lif (6.7g) değerlerini verdi ama
    # protein/yağ kırılımını vermedi — uluslararası kaynaklarda (USDA dahil)
    # standart olan ve diyetkolik'in kalori/lif değerleriyle tutarlı olan
    # protein/karbonhidrat/yağ değerleri kullanıldı.
    (9_000_089, "Ceviz, çiğ", "Walnuts, raw", "Kuruyemiş ve Tohumlar", 654.0, 15.23, 13.71, 65.21, 6.7, None, None),
    # 9_000_090 (Zeytin, 207 kcal) kasıtlı olarak YOK — mevcut "Siyah zeytin"
    # (9_000_040) TAM OLARAK aynı değerlere (207, 1.8, 1.1, 21.0) sahip,
    # ikinci bir kayıt sadece kopya olurdu.
    (9_000_091, "Çay (şekersiz)", "Tea, unsweetened", "İçecekler", 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 1.0),
    (9_000_092, "Filtre kahve (şekersiz)", "Filter coffee, unsweetened", "İçecekler", 1.0, 0.12, 0.0, 0.04, 0.0, 0.0, None),
    (9_000_093, "Türk kahvesi (sade)", "Turkish coffee, plain", "İçecekler", 10.0, 0.6, 0.09, 0.74, 3.76, None, None),
]


def seed_tr_foods() -> int:
    db = SessionLocal()
    try:
        existing_ids = {row.fdc_id for row in db.query(FoodCatalog.fdc_id).all()}
        count = 0
        for fdc_id, name_tr, name_en, category_tr, kcal, protein, carbs, fat, fiber, sugar, sodium in FOODS:
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
                sugar_g=sugar,
                sodium_mg=sodium,
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
