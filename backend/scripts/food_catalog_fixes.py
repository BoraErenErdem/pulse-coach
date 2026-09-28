"""Besin kataloğu isim düzeltmeleri (2026-09-27 denetimi).

USDA kökenli kayıtların Türkçe adları LLM ile toplu çevrildi (translate_catalog.py)
ve çeviri önbelleği git dışında (data_sources/usda/). Denetimde bulunanlar:
- fdc 2709136..2709195 bloğunda her çeviri BİR SONRAKİ öğeye aitti (ör.
  "Lime juice" -> "%100 portakal suyu"); kalori değerleri İngilizce ada ait olduğu
  için kullanıcı portakal suyu deyince misket limonu suyunun değerini alıyordu.
- yanlış çeviriler (Prunes -> "Gün kurusu kayısı", Swiss chard -> "Ispanak",
  Sausage -> "Salam", Popcorn -> "Mısır patlağı", Cowpeas -> "Soya fasulyesi"...),
  uydurma kelimeler ("Kızılçibör", "Sparoz", "Erişme") ve isim yerine çeviri prompt'u.

seed_catalogs.py seed'den sonra bunları uygular; mevcut DB için:
    python -m scripts.food_catalog_fixes
"""

from app.db.session import SessionLocal
from app.models.food_catalog import FoodCatalog
from app.services import food_catalog_service

# fdc_id -> doğru name_tr
NAME_FIXES: dict[int, str] = {
    # 2026-09-28: "50 g yulaf ezmesi" pişmiş lapaya (76 kcal) gidiyordu; Türkiye'de yulaf ezmesi kuru tartılır
    169705: 'Yulaf ezmesi (kuru, pişmemiş)',  # Oats (Includes foods for USDA's Food Distribution Program)
    167568: 'Pastacılık çikolatası, şekersiz, kareler',  # Baking chocolate, unsweetened, squares (kural: yanlış çeviri/yazım)
    167761: 'Graviola (soursop), çiğ',  # Soursop, raw (yanlış çeviri)
    167803: 'Kızılcık sosu, bütün taneli, konserve, OCEAN SPRAY',  # Cranberry sauce, whole, canned, OCEAN SPRAY (yazım/uydurma kelime)
    167804: 'Kızılcık sosu, jöleli, konserve, OCEAN SPRAY',  # Cranberry sauce, jellied, canned, OCEAN SPRAY (yazım/uydurma kelime)
    168092: 'Hindi jambonu, dilimlenmiş, ekstra yağsız, paketli veya şarküteri',  # Ham, turkey, sliced, extra lean, prepackaged or deli (yanlış çeviri)
    168159: 'Kuru erik, konserve, yoğun şuruplu, katı ve sıvı kısımları dahil',  # Prunes, canned, heavy syrup pack, solids and liquids (yanlış çeviri)
    168160: 'Kuru erik, kurutulmuş (düşük nemli), pişmemiş',  # Prunes, dehydrated (low-moisture), uncooked (yanlış çeviri)
    168161: 'Kuru erik, kurutulmuş (düşük nemli), pişmiş',  # Prunes, dehydrated (low-moisture), stewed (yanlış çeviri)
    168391: 'Kudret narı (acı kavun), yapraklı uçlar, çiğ',  # Balsam-pear (bitter gourd), leafy tips, raw (kural: yanlış çeviri/yazım)
    168393: 'Kudret narı (acı kavun), meyve, çiğ',  # Balsam-pear (bitter gourd), pods, raw (kural: yanlış çeviri/yazım)
    168394: 'Kudret narı (acı kavun), meyve, pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Balsam-pear (bitter gourd), pods, cooked, boiled, drained, w (kural: yanlış çeviri/yazım)
    168402: 'Börülce (siyah gözlü), olgunlaşmamış tohumlar, pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Cowpeas (blackeyes), immature seeds, cooked, boiled, drained (kural: yanlış çeviri/yazım)
    168403: 'Börülce (siyah gözlü), olgunlaşmamış tohumlar, dondurulmuş, hazırlanmamış',  # Cowpeas (blackeyes), immature seeds, frozen, unprepared (kural: yanlış çeviri/yazım)
    168405: 'Börülce, tohumlu genç kapsüller, çiğ',  # Cowpeas, young pods with seeds, raw (kural: yanlış çeviri/yazım)
    168406: 'Börülce, yapraklı uçlar, pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Cowpeas, leafy tips, cooked, boiled, drained, without salt (kural: yanlış çeviri/yazım)
    168495: 'Kudret narı (acı kavun), yapraklı uçlar, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Balsam-pear (bitter gourd), leafy tips, cooked, boiled, drai (kural: yanlış çeviri/yazım)
    168496: 'Kudret narı (acı kavun), meyve, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Balsam-pear (bitter gourd), pods, cooked, boiled, drained, w (kural: yanlış çeviri/yazım)
    168526: 'Börülce (siyah gözlü), olgunlaşmamış tohumlar, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Cowpeas (blackeyes), immature seeds, cooked, boiled, drained (kural: yanlış çeviri/yazım)
    168527: 'Börülce (siyah gözlü), olgunlaşmamış tohumlar, dondurulmuş, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Cowpeas (blackeyes), immature seeds, frozen, cooked, boiled, (kural: yanlış çeviri/yazım)
    168528: 'Börülce, tohumlu genç kapsüller, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Cowpeas, young pods with seeds, cooked, boiled, drained, wit (kural: yanlış çeviri/yazım)
    168529: 'Börülce, yapraklı uçlar, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Cowpeas, leafy tips, cooked, boiled, drained, with salt (kural: yanlış çeviri/yazım)
    168859: 'Tortilla cipsi, düşük yağlı, yağsız fırınlanmış',  # Tortilla chips, low fat, baked without fat (yazım/uydurma kelime)
    168860: 'Peynirli mısır çerezi (puf ve burgu), fırınlanmış, düşük yağlı',  # Cheese puffs and twists, corn based, baked, low fat (yanlış çeviri)
    169220: 'Börülce (siyah gözlü), olgunlaşmamış tohumlar, çiğ',  # Cowpeas (blackeyes), immature seeds, raw (kural: yanlış çeviri/yazım)
    169224: 'Börülce, yapraklı uçlar, çiğ',  # Cowpeas, leafy tips, raw (kural: yanlış çeviri/yazım)
    169279: 'Lahana turşusu (sauerkraut), konserve, katı ve sıvı kısımları dahil',  # Sauerkraut, canned, solids and liquids (yazım/uydurma kelime)
    169343: 'Pazı, pişmiş, haşlanmış, süzülmüş, tuzlu',  # Chard, swiss, cooked, boiled, drained, with salt (kural: yanlış çeviri/yazım)
    169991: 'Pazı, çiğ',  # Chard, swiss, raw (kural: yanlış çeviri/yazım)
    169994: 'Frenk soğanı, çiğ',  # Chives, raw (yanlış çeviri)
    170009: 'Yaban havucu (parsnip), pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Parsnips, cooked, boiled, drained, without salt (kural: yanlış çeviri/yazım)
    170075: 'Frenk soğanı, dondurularak kurutulmuş',  # Chives, freeze-dried (yanlış çeviri)
    170197: 'Dana eti, salamura edilmiş, kahvaltılık şeritler, çiğ veya ısıtılmamış',  # Beef, cured, breakfast strips, raw or unheated (yanlış çeviri)
    170198: 'Dana eti, salamura edilmiş, kahvaltılık şeritler, pişmiş',  # Beef, cured, breakfast strips, cooked (yanlış çeviri)
    170401: 'Pazı, pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Chard, swiss, cooked, boiled, drained, without salt (kural: yanlış çeviri/yazım)
    170417: 'Yaban havucu (parsnip), çiğ',  # Parsnips, raw (kural: yanlış çeviri/yazım)
    170486: 'Maydanoz, dondurularak kurutulmuş',  # Parsley, freeze-dried (yazım/uydurma kelime)
    170508: 'Yaban havucu (parsnip), pişmiş, haşlanmış, süzülmüş, tuzlu',  # Parsnips, cooked, boiled, drained, with salt (kural: yanlış çeviri/yazım)
    171183: 'SMART SOUP, Tay usulü Hindistan cevizli köri çorbası',  # SMART SOUP, Thai Coconut Curry (yanlış çeviri)
    171601: 'Barbekü soslu et somunu, domuz, sığır',  # Barbecue loaf, pork, beef (yanlış çeviri)
    171704: 'Kayısı nektarı, konserve, ilave askorbik asitli',  # Apricot nectar, canned, with added ascorbic acid (yanlış çeviri)
    171833: 'Sos, yaban turpu (horseradish)',  # Sauce, horseradish (yanlış çeviri)
    171904: 'Kızılcık suyu kokteyli, şişelenmiş, düşük kalorili, kalsiyumlu, sakarinli ve mısır tatlandırıcılı',  # Cranberry juice cocktail, bottled, low calorie, with calcium (yazım/uydurma kelime)
    172023: 'Darı unu',  # Millet flour (yanlış çeviri)
    172334: 'Katılaştırılmış yağ (Shortening), şekerleme, fraksiyonel palmiye',  # Shortening, confectionery, fractionated palm (yazım/uydurma kelime)
    172416: 'Beç tavuğu (guinea hen), et ve deri, çiğ',  # Guinea hen, meat and skin, raw (yanlış çeviri)
    172425: 'Moth fasulyesi, olgun tohumlar, çiğ',  # Mothbeans, mature seeds, raw (kural: yanlış çeviri/yazım)
    172426: 'Moth fasulyesi, olgun tohumlar, pişmiş, haşlanmış, tuzsuz',  # Mothbeans, mature seeds, cooked, boiled, without salt (kural: yanlış çeviri/yazım)
    172686: 'Ekmek, buğday',  # Bread, wheat (yazım/uydurma kelime)
    172786: 'Turta, pekan cevizli, tariften hazırlanmış',  # Pie, pecan, prepared from recipe (yanlış çeviri)
    172926: 'Zeytinli et somunu, domuz',  # Olive loaf, pork (yanlış çeviri)
    173161: 'Pirinç krakeri',  # Rice crackers (yanlış çeviri)
    173257: 'Mckee Baking, Little Debbie Nutty Bars, Yer Fıstığı Ezmeli Gofretler, Çikolata Kaplı',  # Mckee Baking, Little Debbie Nutty Bars, Wafers with Peanut B (yanlış çeviri)
    173472: 'Yaban turpu, hazırlanmış',  # Horseradish, prepared (yanlış çeviri)
    173758: 'Börülce, yaygın (blackeyes, crowder, southern), olgun tohumlar, çiğ',  # Cowpeas, common (blackeyes, crowder, southern), mature seeds (kural: yanlış çeviri/yazım)
    173760: 'Börülce, yaygın (blackeyes, crowder, southern), olgun tohumlar, konserve, sade',  # Cowpeas, common (blackeyes, crowder, southern), mature seeds (kural: yanlış çeviri/yazım)
    173805: 'Moth fasulyesi, olgun tohumlar, pişmiş, haşlanmış, tuzlu',  # Mothbeans, mature seeds, cooked, boiled, with salt (kural: yanlış çeviri/yazım)
    173961: 'Kızılcık sosu, konserve, tatlandırılmış',  # Cranberry sauce, canned, sweetened (yazım/uydurma kelime)
    173962: 'Kızılcık-portakal sosu (relish), konserve',  # Cranberry-orange relish, canned (yazım/uydurma kelime)
    174206: 'Kabuklular, kerevit, karışık türler, yabani, çiğ',  # Crustaceans, crayfish, mixed species, wild, raw (kural: yanlış çeviri/yazım)
    174207: 'Kabuklular, kerevit, karışık türler, yabani, pişmiş, nemli ısıda pişirilmiş',  # Crustaceans, crayfish, mixed species, wild, cooked, moist he (kural: yanlış çeviri/yazım)
    174471: 'Beç tavuğu (guinea hen), sadece et, çiğ',  # Guinea hen, meat only, raw (yanlış çeviri)
    174535: 'Jambonlu bezelye çorbası (split pea), konserve, düşük sodyumlu, suyla hazırlanmış veya servise hazır',  # Split pea with ham soup, canned, reduced sodium, prepared wi (yanlış çeviri)
    175169: 'Kabuklular, kerevit, karışık türler, çiftlik ürünü, çiğ',  # Crustaceans, crayfish, mixed species, farmed, raw (kural: yanlış çeviri/yazım)
    175170: 'Kabuklular, kerevit, karışık türler, çiftlik ürünü, pişmiş, nemli ısıda pişirilmiş',  # Crustaceans, crayfish, mixed species, farmed, cooked, moist  (kural: yanlış çeviri/yazım)
    175207: 'Fasulyeli chili, konserve',  # Chili with beans, canned (yazım/uydurma kelime)
    175208: 'Börülce, catjang, olgun tohumlar, çiğ',  # Cowpeas, catjang, mature seeds, raw (kural: yanlış çeviri/yazım)
    175209: 'Börülce, catjang, olgun tohumlar, pişmiş, haşlanmış, tuzsuz',  # Cowpeas, catjang, mature seeds, cooked, boiled, without salt (kural: yanlış çeviri/yazım)
    175251: 'Börülce, catjang, olgun tohumlar, pişmiş, haşlanmış, tuzlu',  # Cowpeas, catjang, mature seeds, cooked, boiled, with salt (kural: yanlış çeviri/yazım)
    333374: 'Balık, mezgit (haddock), çiğ',  # Fish, haddock, raw (yanlış çeviri)
    746779: 'Sosis, kahvaltılık, dana eti, önceden pişmiş, hazırlanmamış',  # Sausage, breakfast sausage, beef, pre-cooked, unprepared (yanlış çeviri)
    746780: 'Sosis, İtalyan usulü, domuz eti, hafif, pişmiş, tavada kızarmış',  # Sausage, Italian, pork, mild, cooked, pan-fried (yanlış çeviri)
    746781: 'Sosis, domuz eti, chorizo, bütün veya kıyma, pişmiş, tavada kızarmış',  # Sausage, pork, chorizo, link or ground, cooked, pan-fried (yanlış çeviri)
    746783: 'Sosis, hindi eti, kahvaltılık, hafif, çiğ',  # Sausage, turkey, breakfast links, mild, raw (yanlış çeviri)
    2706171: 'Dana sosisi',  # Beef sausage (yanlış çeviri)
    2706172: 'Peynirli dana sosisi',  # Beef sausage with cheese (yanlış çeviri)
    2706173: 'Kan sosisi',  # Blood sausage (yanlış çeviri)
    2706188: 'Polonya sosisi (kielbasa)',  # Polish sausage (yanlış çeviri)
    2706189: 'İtalyan sosisi',  # Italian sausage (yanlış çeviri)
    2706190: 'Sosis, NFS',  # Sausage, NFS (yanlış çeviri)
    2706191: 'Domuz sosisi',  # Pork sausage (yanlış çeviri)
    2706192: 'Domuz sosisi, düşük yağlı',  # Pork sausage, reduced fat (yanlış çeviri)
    2706193: 'Domuz sosisi, düşük sodyumlu',  # Pork sausage, reduced sodium (yanlış çeviri)
    2706194: 'Domuz ve dana sosisi',  # Pork and beef sausage (yanlış çeviri)
    2706200: 'Hindi veya tavuk sosisi',  # Turkey or chicken sausage (yanlış çeviri)
    2706201: 'Hindi veya tavuk sosisi, düşük sodyumlu',  # Turkey or chicken sausage, reduced sodium (yanlış çeviri)
    2706202: 'Hindi veya tavuk ve domuz sosisi',  # Turkey or chicken and pork sausage (yanlış çeviri)
    2706203: 'Viyana sosisi, konserve',  # Vienna sausage, canned (yanlış çeviri)
    2706204: 'Turşu sosis',  # Pickled sausage (yanlış çeviri)
    2706544: 'İç harçlı (stuffing) tavuk veya hindi',  # Chicken or turkey with stuffing (yanlış çeviri)
    2706687: 'Erişteli tavuk veya hindi chow mein veya chop suey',  # Chicken or turkey chow mein or chop suey with noodles (kural: yanlış çeviri/yazım)
    2706755: 'Domuz incikli lahana',  # Cabbage with ham hocks (yanlış çeviri)
    2706756: 'Jambon veya domuz eti salatası',  # Ham or pork salad (yanlış çeviri)
    2706759: 'Jambonlu veya domuz etli yeşillik',  # Greens with ham or pork (yanlış çeviri)
    2706767: 'Havuç, brokoli ve/veya koyu yeşil yapraklı sebzeler dahil jambon ve sebzeler; patatessiz, sossuz',  # Ham and vegetables including carrots broccoli, and/or dark-  (kural: yanlış çeviri/yazım)
    2706768: 'Havuç, brokoli ve koyu yeşil yapraklı sebzeler hariç jambon ve sebzeler; patatessiz, sossuz',  # Ham and vegetables excluding carrots, broccoli, and dark-gre (kural: yanlış çeviri/yazım)
    2706769: 'Havuç, brokoli ve koyu yeşil yapraklı sebzeler hariç domuz eti ve sebzeler; patatessiz, sossuz',  # Pork and vegetables excluding carrots, broccoli, and dark-gr (yanlış çeviri)
    2706788: 'Havuç, brokoli ve koyu yeşil yapraklı sebzeler hariç sebzeli tavuk veya hindi a la king; patatessiz, krema, beyaz veya çorba bazlı soslu',  # Chicken or turkey a la king with vegetables excluding carror (yanlış çeviri)
    2706874: 'Jambon, balık, peynir ve sebzeli antipasto',  # Antipasto with ham, fish, cheese, vegetables (yanlış çeviri)
    2707036: 'Ton balıklı salata sandviçi, tam buğday ekmeğinde',  # Tuna salad sandwich on wheat (yazım/uydurma kelime)
    2707053: 'İtalyan sosisli sandviç, beyaz ekmekte',  # Italian sausage sandwich on white (yanlış çeviri)
    2707054: 'İtalyan sosisli sandviç, tam buğday ekmeğinde',  # Italian sausage sandwich on wheat (yanlış çeviri)
    2707113: 'Erişte ve peynir soslu tavuk, diyet dondurulmuş öğün',  # Chicken with noodles and cheese sauce, diet frozen meal (kural: yanlış çeviri/yazım)
    2707114: 'Erişteli tavuk ve sebze ana yemeği, diyet dondurulmuş öğün',  # Chicken and vegetable entree with noodles, diet frozen meal (kural: yanlış çeviri/yazım)
    2707116: 'Erişte ve krema soslu tavuk ve sebze ana yemeği, dondurulmuş öğün',  # Chicken and vegetable entree with noodles and cream sauce, f (kural: yanlış çeviri/yazım)
    2707118: 'Soslu ve iç harçlı hindi, patates ve sebze, dondurulmuş öğün',  # Turkey with gravy, dressing, potatoes, vegetable, frozen mea (yanlış çeviri)
    2707120: 'Soslu karides ve sebze, erişte ile, diyet dondurulmuş öğün',  # Shrimp and vegetables in sauce with noodles, diet frozen mea (kural: yanlış çeviri/yazım)
    2707412: 'Börülce (siyah gözlü), NFS',  # Blackeyed peas, NFS (kural: yanlış çeviri/yazım)
    2707413: 'Börülce (siyah gözlü), kurutulmuş',  # Blackeyed peas, from dried (kural: yanlış çeviri/yazım)
    2707437: 'Tofu (soya peyniri)',  # Soybean curd cheese (yazım/uydurma kelime)
    2707466: 'Domuz pastırması (bacon) parçacıkları',  # Bacon bits (yazım/uydurma kelime)
    2708165: 'Patlamış mısır keki',  # Popcorn cake (yanlış çeviri)
    2708216: 'Patlamış mısır, NFS',  # Popcorn, NFS (kural: yanlış çeviri/yazım)
    2708217: 'Patlamış mısır, sinema tipi, ilave tereyağlı',  # Popcorn, movie theater, with added butter (kural: yanlış çeviri/yazım)
    2708218: 'Patlamış mısır, sinema tipi, tereyağı eklenmemiş',  # Popcorn, movie theater, no butter added (kural: yanlış çeviri/yazım)
    2708219: 'Patlamış mısır, hava ile patlatılmış, tereyağı eklenmemiş',  # Popcorn, air-popped, no butter added (kural: yanlış çeviri/yazım)
    2708220: 'Patlamış mısır, hava ile patlatılmış, tereyağı eklenmiş',  # Popcorn, air-popped, with added butter (kural: yanlış çeviri/yazım)
    2708221: 'Patlamış mısır, yağda patlatılmış, tereyağlı değil',  # Popcorn, popped in oil, no butter added (kural: yanlış çeviri/yazım)
    2708222: 'Patlamış mısır, yağda patlatılmış, tereyağı eklenmiş',  # Popcorn, popped in oil, with added butter (kural: yanlış çeviri/yazım)
    2708223: 'Patlamış mısır, mikrodalga, NFS',  # Popcorn, microwave, NFS (kural: yanlış çeviri/yazım)
    2708224: 'Patlamış mısır, mikrodalga, sade',  # Popcorn, microwave, plain (kural: yanlış çeviri/yazım)
    2708225: 'Patlamış mısır, mikrodalga, sade, hafif',  # Popcorn, microwave, plain, light (kural: yanlış çeviri/yazım)
    2708226: 'Patlamış mısır, mikrodalga, düşük sodyumlu',  # Popcorn, microwave, low sodium (kural: yanlış çeviri/yazım)
    2708227: 'Patlamış mısır, mikrodalga, tereyağı aromalı',  # Popcorn, microwave, butter flavored (kural: yanlış çeviri/yazım)
    2708228: 'Patlamış mısır, mikrodalga, aromalı, hafif',  # Popcorn, microwave, flavored, light (kural: yanlış çeviri/yazım)
    2708229: 'Patlamış mısır, mikrodalga, peynir aromalı',  # Popcorn, microwave, cheese flavored (kural: yanlış çeviri/yazım)
    2708230: 'Patlamış mısır, mikrodalga, kazan tipi (kettle)',  # Popcorn, microwave, kettle (kural: yanlış çeviri/yazım)
    2708231: 'Patlamış mısır, hemen tüketimlik, NFS',  # Popcorn, ready-to-eat, NFS (kural: yanlış çeviri/yazım)
    2708232: 'Patlamış mısır, hemen tüketimlik, sade',  # Popcorn, ready-to-eat, plain (kural: yanlış çeviri/yazım)
    2708233: 'Patlamış mısır, hemen tüketimlik, sade, hafif',  # Popcorn, ready-to-eat, plain, light (kural: yanlış çeviri/yazım)
    2708234: 'Patlamış mısır, hemen tüketimlik, düşük sodyumlu',  # Popcorn, ready-to-eat, low sodium (kural: yanlış çeviri/yazım)
    2708235: 'Patlamış mısır, hemen tüketimlik, tereyağı aromalı',  # Popcorn, ready-to-eat, butter flavored (kural: yanlış çeviri/yazım)
    2708236: 'Patlamış mısır, hemen tüketimlik, peynir aromalı',  # Popcorn, ready-to-eat, cheese flavored (kural: yanlış çeviri/yazım)
    2708237: 'Patlamış mısır, hemen tüketimlik, aromalı, hafif',  # Popcorn, ready-to-eat, flavored, light (kural: yanlış çeviri/yazım)
    2708238: 'Patlamış mısır, hemen tüketimlik, kazan tipi (kettle)',  # Popcorn, ready-to-eat, kettle (kural: yanlış çeviri/yazım)
    2708239: 'Patlamış mısır, karamelli kaplama',  # Popcorn, caramel coated (kural: yanlış çeviri/yazım)
    2708240: 'Patlamış mısır, karamelli kaplama, kuruyemişli',  # Popcorn, caramel coated, with nuts (kural: yanlış çeviri/yazım)
    2708241: 'Patlamış mısır, çikolata kaplı',  # Popcorn, chocolate coated (kural: yanlış çeviri/yazım)
    2708243: 'Patlamış mısır cipsi, diğer aromalar',  # Popcorn chips, other flavors (kural: yanlış çeviri/yazım)
    2708244: 'Patlamış mısır cipsi, tatlı aromalar',  # Popcorn chips, sweet flavors (kural: yanlış çeviri/yazım)
    2709019: 'Pirinç, beyaz, koyu yeşil sebzeli ve domatesli ve/veya domates bazlı soslu, yağ ilaveli',  # Rice, white, with dark green vegetables and tomatoes and/or  (yazım/uydurma kelime)
    2709076: 'Pirinç dolgulu domates, etsiz',  # Stuffed tomato, with rice, meatless (yanlış çeviri)
    2709136: 'Sebzeli dürüm (wrap) sandviç',  # Vegetable sandwich wrap (kaymış çeviri bloğu)
    2709137: 'Jöle sandviç, NFS',  # Jelly sandwich, NFS (kaymış çeviri bloğu)
    2709138: 'Jöle sandviç, beyaz ekmek üzerinde',  # Jelly sandwich, on white bread (kaymış çeviri bloğu)
    2709139: 'Jöle sandviç, buğday ekmeği üzerinde',  # Jelly sandwich, on wheat bread (kaymış çeviri bloğu)
    2709140: 'Domates soslu sebzeli erişte, diyet dondurulmuş öğün',  # Noodles with vegetables in tomato-based sauce, diet frozen m (kaymış çeviri bloğu)
    2709141: 'Köfteli spagetti akşam yemeği, NFS, dondurulmuş öğün',  # Spaghetti and meatballs dinner, NFS, frozen meal (kaymış çeviri bloğu)
    2709142: 'Etli spagetti, diyet dondurulmuş öğün',  # Spaghetti with meat sauce, diet frozen meal (kaymış çeviri bloğu)
    2709143: 'Krep ve sosis, dondurulmuş öğün',  # Pancakes and sausage, frozen meal (kaymış çeviri bloğu)
    2709144: 'Çorba, NFS',  # Soup, NFS (kaymış çeviri bloğu)
    2709145: 'Çorba, erişte, NFS',  # Soup, noodle, NFS (kaymış çeviri bloğu)
    2709146: 'Çorba, pirinçli',  # Soup, rice (kaymış çeviri bloğu)
    2709147: 'Çorba, arpa',  # Soup, barley (kaymış çeviri bloğu)
    2709149: 'Çorba, tavuklu şehriye',  # Soup, chicken noodle (kaymış çeviri bloğu)
    2709150: 'Çorba, tavuk, konserve, düşük sodyumlu',  # Soup, chicken, canned, reduced sodium (kaymış çeviri bloğu)
    2709151: 'Çorba, matzo topu',  # Soup, Matzo ball (kaymış çeviri bloğu)
    2709152: 'Çorba, ramen eriştesi, su ilaveli',  # Soup, ramen noodles, water added (kaymış çeviri bloğu)
    2709153: 'Ramen kasesi, NFS',  # Ramen bowl, NFS (kaymış çeviri bloğu)
    2709154: 'Dana etli ramen kasesi',  # Ramen bowl with beef (kaymış çeviri bloğu)
    2709155: 'Tavuklu ramen kasesi',  # Ramen bowl with chicken (kaymış çeviri bloğu)
    2709156: 'Balıklı ramen kasesi',  # Ramen bowl with fish (kaymış çeviri bloğu)
    2709157: 'Vejetaryen ramen kasesi',  # Ramen bowl, vegetarian (kaymış çeviri bloğu)
    2709158: 'Etli ve yumurtalı ramen kasesi',  # Ramen bowl with meat and egg (kaymış çeviri bloğu)
    2709159: 'Yumurtalı vejetaryen ramen kasesi',  # Ramen bowl, vegetarian with egg (kaymış çeviri bloğu)
    2709160: 'Çorba, wonton',  # Soup, wonton (kaymış çeviri bloğu)
    2709161: 'Çorba, sulandırılmış fideo çorbası',  # Soup, sopa de fideo aguada (kaymış çeviri bloğu)
    2709162: 'Çorba, tortilla',  # Soup, tortilla (kaymış çeviri bloğu)
    2709163: 'Tahıl ve sebze proteini bazlı, kızarmış et alternatifi',  # Meat substitute, cereal- and vegetable protein-based, fried (kaymış çeviri bloğu)
    2709164: 'Klementin, çiğ',  # Clementine, raw (kaymış çeviri bloğu)
    2709165: 'Greyfurt, çiğ',  # Grapefruit, raw (kaymış çeviri bloğu)
    2709167: 'Kumkuat, çiğ',  # Kumquat, raw (kaymış çeviri bloğu)
    2709168: 'Limon, çiğ',  # Lemon, raw (kaymış çeviri bloğu)
    2709171: 'Portakal, çiğ',  # Orange, raw (kaymış çeviri bloğu)
    2709172: 'Portakal, konserve, NFS',  # Orange, canned, NFS (kaymış çeviri bloğu)
    2709173: 'Portakal, konserve, meyve suyu paketi',  # Orange, canned, juice pack (kaymış çeviri bloğu)
    2709174: 'Portakal, konserve, şerbetli',  # Orange, canned, in syrup (kaymış çeviri bloğu)
    2709175: 'Mandalina, çiğ',  # Tangerine, raw (kaymış çeviri bloğu)
    2709176: '%100 greyfurt suyu, taze sıkılmış',  # Grapefruit juice, 100%, freshly squeezed (kaymış çeviri bloğu)
    2709177: '%100 greyfurt suyu, formuna göre NS',  # Grapefruit juice, 100%, NS as to form (kaymış çeviri bloğu)
    2709178: '%100 greyfurt suyu, konserve, şişelenmiş veya karton kutuda',  # Grapefruit juice, 100%, canned, bottled or in a carton (kaymış çeviri bloğu)
    2709179: '%100 greyfurt suyu, kalsiyum ilaveli, konserve, şişelenmiş veya karton kutuda',  # Grapefruit juice, 100%, with calcium added (kaymış çeviri bloğu)
    2709180: '%100 limon suyu, formuna göre NS',  # Lemon juice, 100%, NS as to form (kaymış çeviri bloğu)
    2709181: '%100 limon suyu, taze sıkılmış',  # Lemon juice, 100%, freshly squeezed (kaymış çeviri bloğu)
    2709182: '%100 limon suyu, konserve veya şişelenmiş',  # Lemon juice, 100%, canned or bottled (kaymış çeviri bloğu)
    2709183: '%100 misket limonu suyu, formuna göre NS',  # Lime juice, 100%, NS as to form (kaymış çeviri bloğu)
    2709184: '%100 misket limonu suyu, taze sıkılmış',  # Lime juice, 100%, freshly squeezed (kaymış çeviri bloğu)
    2709185: '%100 misket limonu suyu, konserve veya şişelenmiş',  # Lime juice, 100%, canned or bottled (kaymış çeviri bloğu)
    2709186: '%100 portakal suyu, NFS',  # Orange juice, 100%, NFS (kaymış çeviri bloğu)
    2709187: '%100 portakal suyu, taze sıkılmış',  # Orange juice, 100%,  freshly squeezed (kaymış çeviri bloğu)
    2709188: '%100 portakal suyu, konserve, şişelenmiş veya karton kutuda',  # Orange juice, 100%, canned, bottled or in a carton (kaymış çeviri bloğu)
    2709189: '%100 portakal suyu, kalsiyum ilaveli, konserve, şişelenmiş veya karton kutuda',  # Orange juice, 100%, with calcium added, canned, bottled or i (kaymış blok + yazım)
    2709190: '%100 portakal suyu, dondurulmuş, yeniden hazırlanmış',  # Orange juice, 100%, frozen, reconstituted (kaymış çeviri bloğu)
    2709191: '%100 portakal suyu, dondurulmuş, yeniden hazırlanmamış',  # Orange juice, 100%, frozen, not reconstituted (kaymış çeviri bloğu)
    2709192: '%100 portakal suyu, kalsiyum ilaveli, dondurulmuş, yeniden hazırlanmış',  # Orange juice, 100%, with calcium added, frozen, reconstitute (kaymış çeviri bloğu)
    2709193: '%100 mandalina suyu',  # Tangerine juice, 100% (kaymış çeviri bloğu)
    2709194: 'Meyve suyu karışımı, narenciye, %100 meyve suyu',  # Fruit juice blend, citrus, 100% juice (kaymış çeviri bloğu)
    2709195: 'Kuru meyve, NFS',  # Dried, fruit, NFS (kaymış blok)
    2709268: 'Ravent (rhubarb)',  # Rhubarb (yanlış çeviri)
    2709754: 'Jambonlu Porto Riko baharatı',  # Puerto Rican seasoning with ham (yanlış çeviri)
    2709755: 'Jambonsuz ve domates sossuz Porto Riko baharatı',  # Puerto Rican seasoning without ham and tomato sauce (yanlış çeviri)
    2709767: 'Kuşkonmaz, çiğ',  # Asparagus, raw (yazım/uydurma kelime)
    2709788: 'Alabaş (kohlrabi), çiğ',  # Kohlrabi, raw (yazım/uydurma kelime)
    2709804: 'İsveç şalgamı (rutabaga), çiğ',  # Rutabaga, raw (yanlış çeviri)
    2709819: 'Ekşi krema soslu salatalık salatası',  # Cucumber salad, made with sour cream dressing (yanlış çeviri)
    2709834: 'Kuşkonmaz, taze, pişmiş, ilave yağsız',  # Asparagus, fresh, cooked, no added fat (kural: yanlış çeviri/yazım)
    2709835: 'Kuşkonmaz, dondurulmuş, pişmiş, ilave yağsız',  # Asparagus, frozen, cooked, no added fat (kural: yanlış çeviri/yazım)
    2709836: 'Kuşkonmaz, konserve, pişmiş, ilave yağsız',  # Asparagus, canned, cooked, no added fat (kural: yanlış çeviri/yazım)
    2709837: 'Kuşkonmaz, form fark etmeksizin, pişmiş',  # Asparagus, NS as to form, cooked (kural: yanlış çeviri/yazım)
    2709838: 'Kuşkonmaz, taze, pişmiş, yağ eklenmiş, yağ türü belirtilmemiş',  # Asparagus, fresh, cooked, fat added, NS as to fat type (kural: yanlış çeviri/yazım)
    2709839: 'Kuşkonmaz, dondurulmuş, pişmiş, yağ eklenmiş, yağ türü belirtilmemiş',  # Asparagus, frozen, cooked, fat added, NS as to fat type (kural: yanlış çeviri/yazım)
    2709840: 'Kuşkonmaz, konserve, pişmiş, yağ eklenmiş, yağ türü belirtilmemiş',  # Asparagus, canned, cooked, fat added, NS as to fat type (kural: yanlış çeviri/yazım)
    2709841: 'Kuşkonmaz, taze, yağ ile pişmiş',  # Asparagus, fresh, cooked with oil (kural: yanlış çeviri/yazım)
    2709842: 'Kuşkonmaz, taze, tereyağı veya margarin ile pişmiş',  # Asparagus, fresh, cooked with butter or margarine (kural: yanlış çeviri/yazım)
    2709843: 'Kuşkonmaz, dondurulmuş, yağ ile pişmiş',  # Asparagus, frozen, cooked with oil (kural: yanlış çeviri/yazım)
    2709844: 'Kuşkonmaz, dondurulmuş, tereyağı veya margarin ile pişmiş',  # Asparagus, frozen, cooked with butter or margarine (kural: yanlış çeviri/yazım)
    2709845: 'Kuşkonmaz, konserve, yağ ile pişmiş',  # Asparagus, canned, cooked with oil (kural: yanlış çeviri/yazım)
    2709846: 'Kuşkonmaz, konserve, tereyağı veya margarin ile pişmiş',  # Asparagus, canned, cooked with butter or margarine (kural: yanlış çeviri/yazım)
    2709955: 'Yaban havucu (parsnip), pişmiş',  # Parsnips, cooked (kural: yanlış çeviri/yazım)
    2709956: 'Börülce (siyah gözlü), dondurulmuş',  # Blackeyed peas, from frozen (kural: yanlış çeviri/yazım)
    2709957: 'Börülce (siyah gözlü), konserve',  # Blackeyed peas, from canned (kural: yanlış çeviri/yazım)
    2709980: 'İsveç şalgamı (rutabaga), pişmiş',  # Rutabaga, cooked (yanlış çeviri)
    2710002: 'Şalgam, pişmiş',  # Turnip, cooked (yanlış çeviri)
    2710011: 'Biber ve soğan, pişmiş, yağ eklenmiş',  # Peppers and onions, cooked, fat added (yazım/uydurma kelime)
    2710083: 'Yaban turpu (horseradish)',  # Horseradish (yanlış çeviri)
    2710343: 'Hindistan cevizi dolgulu çikolatalı şekerleme',  # Chocolate candy, coconut filled (yanlış çeviri)
    2710540: 'Su, gazlı, aromalı',  # Water, carbonated, flavored (kural: yanlış çeviri/yazım)
    2710708: 'Su, şişelenmiş, sade',  # Water, bottled, plain (kural: yanlış çeviri/yazım)
    2710777: 'Meyve suyu, açai karışımı',  # Fruit juice, acai blend (isim yerine çeviri prompt'u)
    # 2026-09-28 doğrulaması: yerel model taraması + sistematik kurallar (beykon/pastırma,
    # herring/ringa, lean and fat/yağsız ve yağlı, prunes/kuru erik, cereal/kahvaltılık gevrek, NFS)
    167704: 'Salata sosu, beykon ve domates',  # Salad dressing, bacon and tomato
    167724: 'Darı, patlatılmış',  # Millet, puffed
    167751: 'Kuru erik, pişmiş, şeker ilavesiz',  # Plums, dried (prunes), stewed, without added sugar
    167752: 'Kuru erik, pişmiş, ilave şekerli',  # Plums, dried (prunes), stewed, with added sugar
    167869: 'Kanada usulü beykon, hazırlanmamış',  # Canadian bacon, unprepared
    167911: 'HORMEL Kanada Usulü Beykon',  # HORMEL Canadian Style Bacon
    168162: 'Kuru erik, pişmemiş',  # Plums, dried (prunes), uncooked
    168277: 'Domuz eti, salamura edilmiş, beykon, hazırlanmamış',  # Pork, cured, bacon, unprepared
    168324: 'Domuz eti, beykon, eritilmiş yağ, pişmiş',  # Pork, bacon, rendered fat, cooked
    168382: 'Beykon, önceden dilimlenmiş, düşük sodyumlu, hazırlanmamış',  # Bacon, pre-sliced, reduced/low sodium, unprepared
    168383: 'Kanada usulü beykon, pişmiş, tavada kızarmış',  # Canadian bacon, cooked, pan-fried
    168454: 'İsveç şalgamı (rutabaga), çiğ',  # Rutabagas, raw
    168455: 'İsveç şalgamı (rutabaga), pişmiş, haşlanmış, süzülmüş, tuzsuz',  # Rutabagas, cooked, boiled, drained, without salt
    168661: 'Dana eti, chuck eye roast, kemiksiz, America\'s Beef Roast, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, choice, çiğ',  # Beef, chuck eye roast, boneless, America's Beef Roast, separ
    168662: 'Dana eti, chuck eye roast, kemiksiz, America\'s Beef Roast, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, çiğ',  # Beef, chuck eye roast, boneless, America's Beef Roast, separ
    168672: 'Dana eti, omuz (chuck), bıçaklı rosto (blade roast), ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağ temizlenmiş, seçkin (select), çiğ',  # Beef, chuck, blade roast, separable lean and fat, trimmed to
    168694: 'Dana eti, yuvarlak kesim (round), tam kesim, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, round, full cut, separable lean and fat, trimmed to 1/
    168705: 'Dana eti, yuvarlak kesim (round), uç yuvarlak, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, select, çiğ',  # Beef, round, tip round, separable lean and fat, trimmed to 1
    168717: 'Dana eti, kısa bel (short loin), t-bone biftek, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, short loin, t-bone steak, separable lean and fat, trim
    168724: 'Dana eti, fileto (tenderloin), biftek, ayrılmış yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, select, çiğ',  # Beef, tenderloin, steak, separable lean and fat, trimmed to 
    168728: 'Dana eti, üst kontrfile (top sirloin), biftek, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağ temizlenmiş, kaliteli (choice), çiğ',  # Beef, top sirloin, steak, separable lean and fat, trimmed to
    168736: 'Dana eti, alt sirloin, tri-tip roast, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, choice, çiğ',  # Beef, bottom sirloin, tri-tip roast, separable lean and fat,
    168865: 'Atıştırmalıklar, taro cipsi',  # Snacks, taro chips
    168871: 'Darı, pişmiş',  # Millet, cooked
    169187: 'Domuz eti, omuz bölgesi, kemiksiz, ayrılabilir yağsız ve yağlı kısım, çiğ',  # Pork, Shoulder breast, boneless, separable lean and fat, raw
    169188: 'Domuz eti, omuz bölgesi, kemiksiz, ayrılabilir yağsız ve yağlı kısım, pişmiş, ızgara',  # Pork, Shoulder breast, boneless, separable lean and fat, coo
    169189: 'Domuz eti, omuz, küçük parça, kemiksiz, ayrılabilir yağsız ve yağlı kısım, pişmiş, ızgara',  # Pork, shoulder, petite tender, boneless, separable lean and 
    169433: 'Dana eti, flank (pirzola), biftek, ayrılabilir yağsız ve yağlı kısım, 0" yağ temizlenmiş, choice, çiğ',  # Beef, flank, steak, separable lean and fat, trimmed to 0" fa
    169439: 'Dana eti, kaburga, kısa kaburga (shortribs), ayrılabilir yağsız ve yağlı kısım, choice, çiğ',  # Beef, rib, shortribs, separable lean and fat, choice, raw
    169495: 'Dana eti, omuz (chuck), bıçaklı rosto (blade roast), ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağ temizlenmiş, kaliteli (choice), çiğ',  # Beef, chuck, blade roast, separable lean and fat, trimmed to
    169503: 'Dana eti, kaburga, bütün (6-12. kaburgalar), ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, prime, çiğ',  # Beef, rib, whole (ribs 6-12), separable lean and fat, trimme
    169517: 'Dana eti, yuvarlak kesim (round), tam kesim, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, select, çiğ',  # Beef, round, full cut, separable lean and fat, trimmed to 1/
    169527: 'Dana eti, yuvarlak kesim (round), uç yuvarlak, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, round, tip round, separable lean and fat, trimmed to 1
    169534: 'Dana eti, yuvarlak kesim (round), üst yuvarlak, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, prime, çiğ',  # Beef, round, top round, separable lean and fat, trimmed to 1
    169540: 'Dana eti, sırt (loin), üst sırt (top loin), ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağ temizlenmiş, kaliteli (choice), çiğ',  # Beef, loin, top loin, separable lean and fat, trimmed to 1/8
    169545: 'Dana eti, fileto (tenderlain), biftek, ayrılmış yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, tenderloin, steak, separable lean and fat, trimmed to 
    169547: 'Dana eti, fileto (tenderloin), ayrılmış yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, prime, çiğ',  # Beef, tenderloin, separable lean and fat, trimmed to 1/8" fa
    169551: 'Dana eti, üst kontrfile (top sirloin), biftek, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağ temizlenmiş, seçkin (select), çiğ',  # Beef, top sirloin, steak, separable lean and fat, trimmed to
    169559: 'Dana eti, alt sirloin, tri-tip roast, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, çiğ',  # Beef, bottom sirloin, tri-tip roast, separable lean and fat,
    169564: 'Dana eti, flank (pirzola), biftek, ayrılabilir yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, çiğ',  # Beef, flank, steak, separable lean and fat, trimmed to 0" fa
    169668: 'Glazür (şekerli kaplama), tariften hazırlanmış',  # Frostings, glaze, prepared-from-recipe
    169702: 'Darı, çiğ',  # Millet, raw
    169893: 'Beykon parçacıkları, etsiz',  # Bacon bits, meatless
    170528: 'İsveç şalgamı (rutabaga), pişmiş, haşlanmış, süzülmüş, tuzlu',  # Rutabagas, cooked, boiled, drained, with salt
    170809: 'Dana eti, yahni için chuck, ayrılabilir yağsız ve yağlı kısım, select, çiğ',  # Beef, chuck for stew, separable lean and fat, select, raw
    170810: 'Dana eti, yahni için chuck, ayrılabilir yağsız ve yağlı kısım, choice, çiğ',  # Beef, chuck for stew, separable lean and fat, choice, raw
    170819: 'Dana eti, omuz haşlamalık veya biftek, kemiksiz, ayrılabilir yağsız ve yağlı kısım, 0 inç yağ temizlenmiş, select kalite, çiğ',  # Beef, shoulder pot roast or steak, boneless, separable lean 
    170835: 'Dana eti, chuck eye steak, kemiksiz, ayrılabilir yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, çiğ',  # Beef, chuck eye steak, boneless, separable lean and fat, tri
    171204: 'Dana eti, yahni için chuck, ayrılabilir yağsız ve yağlı kısım, select, pişmiş, ağır ateşte pişmiş',  # Beef, chuck for stew, separable lean and fat, select, cooked
    171205: 'Dana eti, yahni için chuck, ayrılabilir yağsız ve yağlı kısım, choice, pişmiş, ağır ateşte pişmiş',  # Beef, chuck for stew, separable lean and fat, choice, cooked
    171206: 'Dana eti, yahni için chuck, ayrılabilir yağsız ve yağlı kısım, tüm dereceler, çiğ',  # Beef, chuck for stew, separable lean and fat, all grades, ra
    171226: 'Dana eti, omuz pot haşlaması, kemiksiz, ayrılabilir yağsız ve yağlı et, 0 inç yağa kadar temizlenmiş, select kalite, pişmiş, haşlanmış',  # Beef, shoulder pot roast, boneless, separable lean and fat, 
    171639: 'Beykon, hindi, mikrodalgada ısıtılmış',  # Bacon, turkey, microwaved
    171640: 'Beykon, hindi, düşük sodyumlu',  # Bacon, turkey, low sodium
    171777: 'Dana eti, temizlenmiş perakende kesimlerden oluşan karışım, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, çiğ',  # Beef, composite of trimmed retail cuts, separable lean and f
    171785: 'Dana eti, omuz bifteği (shoulder steak), kemiksiz, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, choice, pişmiş, ızgara',  # Beef, shoulder steak, boneless, separable lean and fat, trim
    171786: 'Dana eti, omuz bifteği (shoulder steak), kemiksiz, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, select, pişmiş, ızgara',  # Beef, shoulder steak, boneless, separable lean and fat, trim
    171787: 'Dana eti, Plate (tabak), iç skirt bifteği, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, tüm dereceler, pişmiş, mangalda pişmiş',  # Beef, plate, inside skirt steak, separable lean and fat, tri
    171788: 'Dana eti, Plate (tabak), dış skirt bifteği, ayrılmış yağsız ve yağlı kısım, 0" yağ temizlenmiş, tüm dereceler, pişmiş, mangalda pişmiş',  # Beef, plate, outside skirt steak, separable lean and fat, tr
    172149: 'Dana eti, rib eye roast, kemikli, dudaklı (lip-on), ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, select, pişmiş, fırınlanmış',  # Beef, rib eye roast, bone-in, lip-on, separable lean and fat
    172152: 'Dana eti, rib eye steak/roast, kemikli, dudaklı (lip-on), ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, rib eye steak/roast, bone-in, lip-on, separable lean a
    172345: 'Hayvansal yağ, beykon yağı',  # Animal fat, bacon grease
    172394: 'Tavuk, fırınlık, et ve deri ve sakatlık ve boyun, çiğ',  # Chicken, roasting, meat and skin and giblets and neck, raw
    172396: 'Tavuk, fırınlık, sakatatlı, çiğ',  # Chicken, roasting, giblets, raw
    172398: 'Tavuk, fırınlık, beyaz et, sadece et, çiğ',  # Chicken, roasting, light meat, meat only, raw
    172439: 'Beykon (et içermeyen)',  # Bacon, meatless
    172488: 'Kuzu eti, but, sirloin yarısı, ayrılabilir yağsız ve yağlı kısım, 1/4 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, leg, sirloin half, separable lean and fat, trimmed to 
    172500: 'Kuzu eti, omuz, kol, ayrılabilir yağsız ve yağlı kısım, 1/4 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, shoulder, arm, separable lean and fat, trimmed to 1/4"
    172547: 'Kuzu eti, ön incik, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, foreshank, separable lean and fat, trimmed to 1/8" fat
    172551: 'Kuzu eti, sırt (loin), ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, loin, separable lean and fat, trimmed to 1/8" fat, cho
    172568: 'Dana eti, incik (ön ve arka), ayrılabilir yağsız ve yağlı kısım, çiğ',  # Veal, shank (fore and hind), separable lean and fat, raw
    172569: 'Dana eti, incik (ön ve arka), ayrılabilir yağsız ve yağlı kısım, pişmiş, sote',  # Veal, shank (fore and hind), separable lean and fat, cooked,
    173128: 'Dana eti, antrikot (brisket), düz yarı, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, choice, çiğ',  # Beef, brisket, flat half, separable lean and fat, trimmed to
    173352: 'Dana eti, kısa bel (short loin), t-bone biftek, ayrılabilir yağsız ve yağlı kısım, 1/8" yağ temizlenmiş, select, çiğ',  # Beef, short loin, t-bone steak, separable lean and fat, trim
    173403: 'Dana eti, rib eye bifteği, kemiksiz, dudaklı (lip off), ayrılabilir yağsız ve yağlı et, 0 inç yağa kadar temizlenmiş, choice kalite, çiğ',  # Beef, rib eye steak, boneless, lip off, separable lean and f
    173404: 'Dana eti, rib eye bifteği, kemiksiz, dudaklı (lip off), ayrılabilir yağsız ve yağlı et, 0 inç yağa kadar temizlenmiş, select kalite, çiğ',  # Beef, rib eye steak, boneless, lip off, separable lean and f
    173567: 'Kızartma katı yağı (ağır hizmet), dana içyağı ve pamuk çekirdeği yağı',  # Shortening frying (heavy duty), beef tallow and cottonseed
    173636: 'Tavuk, fırınlık, sadece et, çiğ',  # Chicken, roasting, meat only, raw
    173638: 'Tavuk, fırınlık, koyu et, sadece et, çiğ',  # Chicken, roasting, dark meat, meat only, raw
    173668: 'Balık, ringa, Atlantik, tütsülenmiş (kipper)',  # Fish, herring, Atlantic, kippered
    173669: 'Balık, ringa, Pasifik, çiğ',  # Fish, herring, Pacific, raw
    173823: 'Dana eti, sırt (loin), ayrılabilir yağsız ve yağlı kısım, çiğ',  # Veal, loin, separable lean and fat, raw
    173827: 'Dana eti, kaburga, ayrılabilir yağsız ve yağlı kısım, pişmiş, fırınlanmış',  # Veal, rib, separable lean and fat, cooked, roasted
    173838: 'Dana eti, omuz, bıçak kesimi (blade chop), sadece ayrılabilir yağsız kısım, çiğ',  # Veal, shoulder, blade chop, separable lean only, raw
    174233: 'Balık, ringa, Pasifik, pişmiş, kuru ısıda',  # Fish, herring, Pacific, cooked, dry heat
    174315: 'Kuzu eti, but, incik yarısı, ayrılabilir yağsız ve yağlı kısım, 1/4 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, leg, shank half, separable lean and fat, trimmed to 1/
    174319: 'Kuzu eti, sırt (loin), ayrılabilir yağsız ve yağlı kısım, 1/4 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, loin, separable lean and fat, trimmed to 1/4" fat, cho
    174321: 'Kuzu eti, kaburga, ayrılabilir yağsız ve yağlı kısım, 1/4 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, rib, separable lean and fat, trimmed to 1/4" fat, choi
    174371: 'Kuzu eti, ön incik, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, pişmiş, sote edilmiş (haşlama)',  # Lamb, foreshank, separable lean and fat, trimmed to 1/8" fat
    174374: 'Kuzu eti, but, incik yarısı, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, leg, shank half, separable lean and fat, trimmed to 1/
    174377: 'Kuzu eti, kaburga, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, rib, separable lean and fat, trimmed to 1/8" fat, choi
    174380: 'Kuzu eti, omuz, kol, ayrılabilir yağsız ve yağlı kısım, 1/8 inç yağa kadar temizlenmiş, seçkin, çiğ',  # Lamb, shoulder, arm, separable lean and fat, trimmed to 1/8"
    174393: 'Dana eti, göğüs, bütün, kemiksiz, ayrılabilir yağsız ve yağlı kısım, pişmiş, sote',  # Veal, breast, whole, boneless, separable lean and fat, cooke
    174394: 'Dana eti, göğüs, karın (plate half), kemiksiz, ayrılabilir yağsız ve yağlı kısım, pişmiş, sote',  # Veal, breast, plate half, boneless, separable lean and fat, 
    174586: 'Sosis, İtalyan usulü, domuz eti, hafif, pişmiş, tavada kızartılmış',  # Sausage, Italian, pork, mild, cooked, pan-fried
    174592: 'Beykon, hindi, hazırlanmamış',  # Bacon, turkey, unprepared
    174602: 'Beykon ve sığır eti çubukları',  # Bacon and beef sticks
    174770: 'Dana eti, alt sirloin, tri-tip roast, sadece ayrılabilir yağsız kısım, 0" yağ temizlenmiş, tüm dereceler, çiğ',  # Beef, bottom sirloin, tri-tip roast, separable lean only, tr
    175116: 'Balık, ringa, Atlantik, çiğ',  # Fish, herring, Atlantic, raw
    175118: 'Balık, ringa, Atlantik, salamura',  # Fish, herring, Atlantic, pickled
    175266: 'Dana eti, temizlenmiş perakende kesimlerinden oluşan karışım, ayrılabilir yağ, çiğ',  # Veal, composite of trimmed retail cuts, separable fat, raw
    175267: 'Dana eti, temizlenmiş perakende kesimlerinden oluşan karışım, ayrılabilir yağ, pişmiş',  # Veal, composite of trimmed retail cuts, separable fat, cooke
    175275: 'Dana eti, kaburga, ayrılabilir yağsız ve yağlı kısım, çiğ',  # Veal, rib, separable lean and fat, raw
    175280: 'Dana eti, omuz, bütün (kol ve bıçak kesimi), sadece ayrılabilir yağsız kısım, çiğ',  # Veal, shoulder, whole (arm and blade), separable lean only, 
    175286: 'Dana eti, kontrfilet, ayrılabilir yağsız ve yağlı kısım, çiğ',  # Veal, sirloin, separable lean and fat, raw
    175287: 'Dana eti, kontrfilet, ayrılabilir yağsız ve yağlı kısım, pişmiş, sote/haşlama',  # Veal, sirloin, separable lean and fat, cooked, braised
    749420: 'Domuz eti, salamlanmış, beykon, pişmiş, restoran',  # Pork, cured, bacon, cooked, restaurant
    2705856: 'Dana eti, beykon, pişmiş',  # Beef, bacon, cooked
    2705857: 'Dana eti, beykon, düşük sodyumlu, pişmiş',  # Beef, bacon, reduced sodium, cooked
    2705884: 'Kanada usulü beykon, pişmiş',  # Canadian bacon, cooked
    2705885: 'Beykon, et türüne göre, pişmiş',  # Bacon, NS as to type of meat, cooked
    2705886: 'Beykon, et türüne göre, düşük sodyumlu, pişmiş',  # Bacon, NS as to type of meat, reduced sodium, cooked
    2705887: 'Domuz beykon, taze, tütsülenmiş veya salamlanmış, pişmiş',  # Pork bacon, NS as to fresh, smoked or cured, cooked
    2705888: 'Domuz beykon, taze, tütsülenmiş veya salamlanmış, düşük sodyumlu, pişmiş',  # Pork bacon, NS as to fresh, smoked or cured, reduced sodium,
    2705889: 'Domuz beykon, tütsülenmiş veya salamlanmış, pişmiş',  # Pork bacon, smoked or cured, cooked
    2705890: 'Beykon veya yan domuz eti, taze, pişmiş',  # Bacon or side pork, fresh, cooked
    2705891: 'Domuz beykon, tütsülenmiş veya salamlanmış, düşük sodyumlu, pişmiş',  # Pork bacon, smoked or cured, reduced sodium, cooked
    2706135: 'Hindi beykon, pişmiş',  # Turkey bacon, cooked
    2706136: 'Hindi beykon, düşük sodyumlu, pişmiş',  # Turkey bacon, reduced sodium, cooked
    2706812: 'Beykonlu ve peynirli tavuk veya hindi bahçe salatası; tavuk ve/veya hindi, beykon, peynir, marul ve/veya yeşillikler, domates ve/veya havuç, diğer sebzeler, sossuz.',  # Chicken or turkey garden salad with bacon and cheese, chicke
    2706813: 'Panelenmiş, kızarmış tavuk veya hindi; beykonlu ve peynirli bahçe salatası; tavuk ve/veya hindi, beykon, peynir, marul ve/veya yeşillikler, domates ve/veya havuç, diğer sebzeler, sossuz.',  # Chicken or turkey, breaded, fried, garden salad with bacon a
    2706979: 'Beyaz ekmek üzerinde beykonlu, marullu, domatesli sandviç',  # Bacon, lettuce, tomato sandwich on white
    2706980: 'Buğday ekmeği üzerinde beykonlu, marullu, domatesli sandviç',  # Bacon, lettuce, tomato sandwich on wheat
    2707317: 'İngiliz muffin üzerinde beykonlu yumurta sandviçi',  # Egg sandwich on English muffin, with bacon
    2707321: 'Kruvasan üzerinde beykonlu yumurta sandviçi',  # Egg sandwich on croissant, with bacon
    2707326: 'Bisküvi (biscuits) üzerinde beykonlu yumurta sandviçi',  # Egg sandwich on biscuit, with bacon
    2707327: 'Bisküvi (biscuits) üzerinde beykonlu ve peynirli yumurta sandviçi',  # Egg sandwich on biscuit, with bacon and cheese
    2707330: 'Bagel üzerinde beykonlu yumurta sandviçi',  # Egg sandwich on bagel, with bacon
    2707337: 'Beykonlu bisküvi (biscuits) sandviçi',  # Bacon biscuit sandwich
    2707345: 'Beykonlu yumurtalı burrito',  # Egg burrito, with bacon
    2707465: 'Beykon dilimi, etsiz',  # Bacon strip, meatless
    2707969: 'Kurabiye, hayvan figürlü, kremalı veya kaplamalı',  # Cookie, animal, with frosting or icing
    2708082: 'Tahıl veya granola bar (General Mills Fiber One Chewy Bar)',  # Cereal or granola bar (General Mills Fiber One Chewy Bar)
    2708083: "Tahıl veya granola bar (Kellogg's Nutri-Grain Cereal Bar)",  # Cereal or granola bar (Kellogg's Nutri-Grain Cereal Bar)
    2708084: "Tahıl veya granola bar (Kellogg's Nutri-Grain Yogurt Bar)",  # Cereal or granola bar (Kellogg's Nutri-Grain Yogurt Bar)
    2708085: "Tahıl veya granola bar (Kellogg's Nutri-Grain Fruit and Nut Bar)",  # Cereal or granola bar (Kellogg's Nutri-Grain Fruit and Nut B
    2708087: "Tahıl veya granola bar (Kellogg's Special K bar)",  # Cereal or granola bar (Kellogg's Special K bar)
    2708088: 'Tahıl veya granola bar (Kashi Chewy)',  # Cereal or granola bar (Kashi Chewy)
    2708089: 'Tahıl veya granola bar (Kashi Crunchy)',  # Cereal or granola bar (Kashi Crunchy)
    2708090: 'Tahıl veya granola bar (KIND Meyve ve Kuruyemiş Barı)',  # Cereal or granola bar (KIND Fruit and Nut Bar)
    2708091: 'Tahıl veya granola bar (General Mills Nature Valley Chewy Trail Mix)',  # Cereal or granola bar (General Mills Nature Valley Chewy Tra
    2708092: 'Tahıl veya granola bar, yoğurt kaplı (General Mills Nature Valley Chewy Granola Bar)',  # Cereal or granola bar, with yogurt coating (General Mills Na
    2708093: 'Tahıl veya granola bar (General Mills Nature Valley Sweet and Salty Granola Bar)',  # Cereal or granola bar (General Mills Nature Valley Sweet and
    2708094: 'Tahıl veya granola bar (General Mills Nature Valley Crunchy Granola Bar)',  # Cereal or granola bar (General Mills Nature Valley Crunchy G
    2708095: 'Tahıl veya granola bar (Quaker Chewy Granola Bar)',  # Cereal or granola bar (Quaker Chewy Granola Bar)
    2708096: 'Tahıl veya granola bar (Quaker Chewy 90 Kalori Granola Bar)',  # Cereal or granola bar (Quaker Chewy 90 Calorie Granola Bar)
    2708097: 'Tahıl veya granola bar (Quaker Chewy %25 Daha Az Şekerli Granola Bar)',  # Cereal or granola bar (Quaker Chewy 25% Less Sugar Granola B
    2708098: 'Tahıl veya granola bar (Quaker Chewy Dipps Granola Bar)',  # Cereal or granola bar (Quaker Chewy Dipps Granola Bar)
    2708099: 'Tahıl veya granola bar (Quaker Granola Bites)',  # Cereal or granola bar (Quaker Granola Bites)
    2708101: 'Tahıl veya granola bar, NFS',  # Cereal or Granola bar, NFS
    2708102: 'Tahıl veya granola bar, düşük yağlı, NFS',  # Cereal or granola bar, lowfat, NFS
    2708103: 'Tahıl veya granola bar, yağsız',  # Cereal or granola bar, nonfat
    2708104: 'Tahıl veya granola bar, azaltılmış şeker, NFS',  # Cereal or granola bar, reduced sugar, NFS
    2708105: 'Tahıl veya granola bar, meyve ve kuruyemişli',  # Cereal or granola bar, fruit and nut
    2708106: 'Tahıl veya granola bar, yer fıstığı, yulaf, şeker, buğday kepeği',  # Cereal or granola bar, peanuts , oats, sugar, wheat germ
    2708107: 'Tahıl veya granola bar, çikolata kaplı, NFS',  # Cereal or granola bar, chocolate coated, NFS
    2708108: 'Tahıl veya granola bar, Hindistan cevizi içeren, çikolata kaplı',  # Cereal or granola bar, with coconut, chocolate coated
    2708110: 'Tahıl veya granola bar, yulaf, kuruyemiş, çikolatasız kaplama ile kaplanmış',  # Cereal or granola bar, oats, nuts, coated with non-chocolate
    2708111: 'Tahıl veya granola bar, çikolatasız kaplama ile kaplanmış',  # Cereal or granola bar, coated with non-chocolate coating
    2708112: 'Tahıl veya granola bar, yüksek lifli, çikolatasız yoğurt kaplamasıyla kaplanmış',  # Cereal or granola bar, high fiber, coated with non-chocolate
    2708113: 'Tahıl veya granola bar, pirinç gevreği içeren',  # Cereal or granola bar, with rice cereal
    2708114: 'Kahvaltılık bar, NFS',  # Breakfast bar, NFS
    2708127: 'Besleyici bar veya öğün yerine geçen bar, NFS',  # Nutrition bar or meal replacement bar, NFS
    2708132: 'Kraker, NFS',  # Crackers, NFS
    2708458: 'Kahvaltılık gevrek, pirinç çıtırı, aromalı',  # Cereal, rice crispy, flavored
    2708459: 'Kahvaltılık gevrek, meyve halkaları',  # Cereal, fruit rings
    2708460: 'Kahvaltılık gevrek, meyve çıtırı',  # Cereal, fruit crispy
    2708461: 'Kahvaltılık gevrek, granola',  # Cereal, granola
    2708462: 'Kahvaltılık gevrek, yulaf demetleri',  # Cereal, oat bunches
    2708464: 'Kahvaltılık gevrek, O şekilli, bal ve kuruyemişli',  # Cereal, O's, honey nut
    2708465: 'Kahvaltılık gevrek, çok tahıllı',  # Cereal, multigrain
    2708466: 'Kahvaltılık gevrek, yulaf kareleri',  # Cereal, oat squares
    2708467: 'Kahvaltılık gevrek, marshmallowlu kaplamalı yulaf',  # Cereal, frosted oats with marshmallows
    2708468: 'Kahvaltılık gevrek, O şekilli, çok tahıllı',  # Cereal, O's, multigrain
    2708469: 'Kahvaltılık gevrek, kepekli gevrek, aromalı',  # Cereal, bran flakes, flavored
    2708470: 'Kahvaltılık gevrek, pirinç kareleri',  # Cereal, rice squares
    2708471: 'Kahvaltılık gevrek, K şekilli, sade',  # Cereal, K's, plain
    2708472: 'Kahvaltılık gevrek, K şekilli, aromalı',  # Cereal, K's, flavored
    2708473: 'Kahvaltılık gevrek, aromalı pıtırlar',  # Cereal, flavored puffs
    2708475: 'Kahvaltılık gevrek, O şekilli, belirtilmemiş',  # Cereal, O's, NFS
    2708476: 'Kahvaltılık gevrek, buğday kareleri',  # Cereal, wheat squares
    2708478: 'Kahvaltılık gevrek, sade pıtırlar',  # Cereal, plain puffs
    2708479: 'Kahvaltılık gevrek, lifli buğday, sade',  # Cereal, shredded wheat, plain
    2708480: 'Kahvaltılık gevrek, buğday gevreği (flakes)',  # Cereal, wheat flakes
    2708481: 'Kahvaltılık gevrek, diğer, belirtilmemiş',  # Cereal, other, NFS
    2708482: 'Kahvaltılık gevrek, diğer, sade',  # Cereal, other, plain
    2708483: 'Kahvaltılık gevrek, diğer, meyveli',  # Cereal, other, fruit flavored
    2708484: 'Kahvaltılık gevrek, diğer, çikolatalı',  # Cereal, other, chocolate
    2708485: 'Kahvaltılık gevrek, diğer, yer fıstıklı',  # Cereal, other, peanut butter
    2708486: 'Kahvaltılık gevrek, diğer, ballı',  # Cereal, other, honey
    2708487: 'Kahvaltılık gevrek, düşük şekerli',  # Cereal, reduced sugar
    2708956: 'Kızarmış pirinç (fried rice), karidesli',  # Rice, fried, with shrimp
    2709490: 'Patates kabukları, peynirli ve beykonlu',  # Potato skins, with cheese and bacon
    2709812: 'Karnabahar, peynir, beykon parçacıkları ve soslu brokoli salatası',  # Broccoli salad with cauliflower, cheese, bacon bits, and dre
    2709828: 'Marul, beykon soslu, öldürülmüş (haşlanmış)',  # Lettuce, wilted, with bacon dressing
    2709829: 'Yedi katlı salata; soğan, kereviz, yeşil biber, bezelye, mayonez, peynir, yumurta ve/veya beykon karışımıyla hazırlanan marul salatası',  # Seven-layer salad, lettuce salad made with a combination of 
    2710198: 'Beykon ve domatesli sos',  # Bacon and tomato dressing
    # Aynı Türkçe adı taşıyan farklı kayıtlar (eş-ad hedefi belirsizleşiyordu)
    168195: 'Klementin, çiğ',  # Clementines, raw ("Mandalina, çiğ" ile çakışıyordu)
    2706166: 'Hot dog sosisi, NFS',  # Hot dog, NFS ("Sosis, NFS" ile çakışıyordu)
    2709072: 'Etli biber dolması (Amerikan usulü)',  # Stuffed pepper, with meat (elle eklenen kayıtla çakışıyordu)
    # 2. tur (survey kayıtları, her öğe için zorunlu karar): USDA Ham domuz jambonudur - 'Dana jambonu' yanlış etiketti; NS as to fat eaten; balık türleri
    171626: 'Domuz jambonu, doğranmış, konserve',  # Ham, chopped, canned
    171627: 'Domuz jambonu, doğranmış, konserve değil',  # Ham, chopped, not canned
    171628: 'Domuz jambonu ve peynirli somun veya rulo',  # Ham and cheese loaf or roll
    171629: 'Domuz jambonu ve peynir ezmesi',  # Ham and cheese spread
    173863: 'Domuz jambonu, dilimlenmiş, önceden paketlenmiş, şarküteri ürünü (%96 yağsız, su ilaveli)',  # Ham, sliced, pre-packaged, deli meat (96%fat free, water add
    173864: 'Domuz jambonu, dilimlenmiş, normal (%10 civarı yağlı)',  # Ham, sliced, regular (approximately 11% fat)
    173865: 'Domuz jambonu, kıyma',  # Ham, minced
    173866: 'Domuz jambonlu salata sosu',  # Ham salad spread
    173881: 'Domuz jambonu, tütsülenmiş, ekstra yağsız, düşük sodyumlu',  # Ham, smoked, extra lean, low sodium
    174611: 'Domuz jambonu, ballı, tütsülenmiş, pişmiş',  # Ham, honey, smoked, cooked
    332397: 'Domuz jambonu, dilimlenmiş, önceden paketlenmiş, şarküteri ürünü (%96 yağsız, su ilaveli)',  # Ham, sliced, pre-packaged, deli meat (96%fat free, water add
    746952: 'Domuz jambonu, dilimlenmiş, restoran tipi',  # Ham, sliced, restaurant
    2705823: 'Antrikot/Bonfile, et türü olarak NS, yağın yenip yenmediği belirtilmemiş',  # Steak, NS as to type of meat, NS as to fat eaten
    2705828: 'Dana eti, biftek, antrikot, yağın yenip yenmediği belirtilmemiş',  # Beef, steak, ribeye, NS as to fat eaten
    2705832: 'Dana eti, biftek, kontrfile, yağın yenip yenmediği belirtilmemiş',  # Beef, steak, sirloin, NS as to fat eaten
    2705835: 'Dana eti, biftek, antrikot, yağın yenip yenmediği belirtilmemiş',  # Beef, steak, strip, NS as to fat eaten
    2705838: 'Dana eti, biftek, T-bone, yağın yenip yenmediği belirtilmemiş',  # Beef, steak, T-bone, NS as to fat eaten
    2705866: 'Domuz, pirzola, yağın yenip yenmediği belirtilmemiş',  # Pork, chop, NS as to fat eaten
    2705869: 'Domuz, kaplamalı pirzola, yağın yenip yenmediği belirtilmemiş',  # Pork, chop, coated, NS as to fat eaten
    2705873: 'Domuz, biftek, yağın yenip yenmediği belirtilmemiş',  # Pork, steak, NS as to fat eaten
    2705878: 'Domuz jambonu (Ham)',  # Ham
    2705879: 'Domuz jambonu, prosciutto',  # Ham, prosciutto
    2706210: 'Domuz jambonlu konserve et, blok tip',  # Ham luncheon meat, loaf type
    2706222: 'Domuz jambonlu salata ezmesi',  # Ham salad spread
    2706269: 'Balık, kefal',  # Fish, mullet
    2706283: 'Balık, lutjan (snapper)',  # Fish, snapper
    2706402: 'Domuz jambonlu stroganoff',  # Ham stroganoff
    2706508: 'Domuz jambonlu kroket',  # Ham croquette
    2706634: 'Domuz jambonu veya domuz eti, erişte ve havuç, brokoli ve koyu yeşil yapraklı sebzeler hariç diğer sebzeler;sossuz',  # Ham or pork, noodles and vegetables excluding carrots, brocc
    2706635: 'Domuz jambonu veya domuz eti, erişte ve havuç, brokoli ve/veya koyu yeşil yapraklı sebzeler dahil diğer sebzeler; sossuz',  # Ham or pork, noodles, and vegetables including carrots, broc
    2706636: 'Domuz jambonu veya domuz eti, erişte ve havuç, brokoli ve koyu yeşil yapraklı sebzeler hariç diğer sebzeler; peynir sosu',  # Ham or pork, noodles and vegetables excluding carrots, brocc
    2706638: 'Domuz jambonu veya domuz eti, erişte ve havuç, brokoli ve/veya koyu yeşil yapraklı sebzeler dahil diğer sebzeler; domates bazlı sos',  # Ham or pork, noodles, and vegetables including carrots, broc
    2706653: 'Domuz jambonu, patates ve havuç, brokoli ve koyu yeşil yapraklı sebze hariç sebzeler;sossuz',  # Ham, potatoes, and vegetables excluding carrots, broccoli, a
    2706654: 'Domuz jambonu, patates ve havuç, brokoli ve/veya koyu yeşil yapraklı sebze dahil sebzeler;sossuz',  # Ham, potatoes, and vegetables including carrots, broccoli, a
    2706725: 'İşkembe yahnisi, patatesli, Porto Riko usulü',  # Stewed tripe, with potatoes, Puerto Rican style
    2706843: 'Surimi (taklit yengeç) ile yapılmış yengeç salatası',  # Crab salad made with imitation crab
    2706970: 'Domuz jambonlu dürüm sandviç',  # Ham sandwich wrap
    2707209: 'Peynirli yumurta omleti veya çırpılmış yumurta, tereyağı ile hazırlanmış',  # Egg omelet or scrambled egg, with cheese, made with butter
    2707338: 'Domuz jambonlu bisküvi (biscuits) sandviçi',  # Ham biscuit sandwich
    2707431: 'Mercimek körisi',  # Lentil curry
    2707545: 'Kavrulmuş soya ezmesi',  # Soy nut butter
    # 2. tur son kısım: yazım hataları (domtes, sondumlu, NSF...), uydurma kelimeler (Kızkıvam, Rezene balığı)
    2707274: 'Peynirli, etli ve koyu yeşil olmayan ve/veya domates dışındaki sebzelerle hazırlanmış yumurta omleti veya çırpılmış yumurta, yağ eklenmiş',  # Egg omelet or scrambled egg, with cheese, meat, and vegetabl
    2708778: 'Manicotti, sebze ve peynir dolgulu, domates soslu, etsiz',  # Manicotti, vegetable- and cheese-filled, with tomato sauce, 
    2709056: 'Pirinç, esmer, havuçlu ve domatesli ve/veya domates bazlı soslu, yağ ilavesiz',  # Rice, brown, with carrots and tomatoes and/or tomato-based s
    2709087: 'İspanyol pilavı, yağ türü belirtilmemiş',  # Spanish rice, NS as to fat
    2709256: 'Armut, konserve, NFS',  # Pear, canned, NFS
    2709261: 'Ananas, konserve, NFS',  # Pineapple, canned, NFS
    2709271: 'Böğürtlen/Çilek vb. (Berries), NFS',  # Berries, NFS
    2709280: 'Kızılcık sosu',  # Cranberry sauce
    2709289: 'Meyve kokteyli, konserve, NFS',  # Fruit cocktail, canned, NFS
    2709307: 'Guacamole, NFS',  # Guacamole, NFS
    2709315: 'Meyve suyu, NFS',  # Fruit juice, NFS
    2709499: 'Patates, ezme (püre), taze hazırlanan, NFS',  # Potato, mashed, from fresh, NFS
    2709526: 'Patates, fırında, kabuğuyla, ekşi kremalı',  # Potato, baked, peel eaten, with sour cream
    2709527: 'Patates, fırında, kabuğuyla, peynirli',  # Potato, baked, peel eaten, with cheese
    2709528: 'Patates, fırında, kabuğuyla, etli',  # Potato, baked, peel eaten, with meat
    2709768: 'Fasulye filizi (maş), çiğ',  # Bean sprouts, raw
    2709779: 'Rezene, çiğ',  # Fennel bulb, raw
    2709890: 'Lahana, yeşil, pişmiş, yağ ilaveli, yağ türü belirtilmemiş',  # Cabbage, green, cooked, fat added, NS as to fat type
    2709927: 'Mısır, konserve, düşük sodyumlu, pişmiş, tereyağı veya margarin ile',  # Corn, canned, reduced sodium, cooked with butter or margarin
    2710102: 'Şalgam turşusu',  # Turnip, pickled
    2710189: 'Aspir (safflower) yağı',  # Safflower oil
    2710726: 'Besleyici içecek veya shake, yüksek proteinli, içime hazır, NFS',  # Nutritional drink or shake, high protein, ready-to-drink, NF
}


# Yanlış çevrilmiş kategori adları (2026-09-28): eski -> doğru
CATEGORY_FIXES: dict[str, str] = {
    "Mısır patlağı": "Patlamış mısır",
    "Pastırma": "Beykon",  # USDA "Bacon" - Türk pastırması değil
    "Yağlar ve Yağlar": "Katı ve Sıvı Yağlar",  # "Fats and Oils"
    "Tatlı su balıkları ve kabuklu deniz ürünleri": "Balık ve kabuklu deniz ürünleri",  # "Finfish and Shellfish"
}


def apply_name_fixes(db) -> int:
    """İsim ve kategori düzeltmelerini uygular, değişen satır sayısını döner (idempotent)."""
    changed = 0
    for row in db.query(FoodCatalog).filter(FoodCatalog.fdc_id.in_(list(NAME_FIXES))):
        name = NAME_FIXES[row.fdc_id]
        if row.name_tr != name:
            row.name_tr = name
            changed += 1
    for row in db.query(FoodCatalog).filter(FoodCatalog.category_tr.in_(list(CATEGORY_FIXES))):
        assert row.category_tr is not None
        row.category_tr = CATEGORY_FIXES[row.category_tr]
        changed += 1
    db.commit()
    food_catalog_service.invalidate_cache()
    return changed


if __name__ == "__main__":
    session = SessionLocal()
    try:
        print(f"[food_catalog] {apply_name_fixes(session)} isim düzeltildi")
    finally:
        session.close()
