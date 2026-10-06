"""Sık yazılan Türkçe besin adlarının katalogdaki doğru kayda sabit eşlemesi.

Genel fuzzy eşleştirme (fuzzy_match.py) tek kelimelik yaygın sorgularda
katalogdaki alakasız bir kayda gidiyordu: "çay" -> "Çay, kombucha", "tost" ->
"Tost pastaları...", "pilav" -> "Pilav, karidesli, kızarmış", "kola" -> "Rum ve
kola", "su" -> "Su, tonik" (2026-09-26 canlı test). Algoritmayı bu sorgular
için ayarlamak başka eşleşmeleri bozuyordu, bu yüzden SADECE bu tam sorgular
için sabit bir liste tutuluyor - listede olmayan her sorgu eskisi gibi fuzzy
eşleşir.

Anahtar: kullanıcının/modelin yazdığı ad (tr_lower + tek boşluk). Değer:
katalogdaki kaydın `name_tr`'si (katalogda benzersiz). Hedef katalogda yoksa
eşleme sessizce atlanır ve fuzzy eşleştirmeye düşülür. Katalogda karşılığı
olmayan yemekler BİLEREK listede yok - yanlış bir kayda yönlendirmek tam da
düzeltilen sorun olurdu (menemen/börek/salata 2026-09-27'de kataloğa eklendi).
"""

FOOD_ALIASES: dict[str, str] = {
    # İçecekler
    "çay": "Çay (şekersiz)",
    "siyah çay": "Çay (şekersiz)",
    "demli çay": "Çay (şekersiz)",
    "şekerli çay": "Çay (şekerli)",
    "kahve": "Filtre kahve (şekersiz)",
    "su": "Su, gazsız",
    "içme suyu": "Su, gazsız",
    "maden suyu": "Su, gazlı, sade",
    "soda": "Su, gazlı, sade",
    "kola": "Gazlı içecek, kola",
    "süt": "Süt (tam yağlı)",
    # Tahıllar / hamur işleri
    "pilav": "Pirinç pilavı (sade)",
    "pirinç": "Pirinç pilavı (sade)",
    "pirinç pilavı": "Pirinç pilavı (sade)",
    # Model sık sık niteleyici ekliyor ("pişmiş pilav" -> karidesli pilav, eval 2026-09-27)
    "pişmiş pilav": "Pirinç pilavı (sade)",
    "sade pilav": "Pirinç pilavı (sade)",
    "beyaz pilav": "Pirinç pilavı (sade)",
    "pişmiş pirinç": "Pirinç pilavı (sade)",
    "ekmek": "Ekmek, beyaz",
    "beyaz ekmek": "Ekmek, beyaz",
    # "Ekmek dilimi" -> "Ekmek, naan" (eval 2026-09-27, model tostu ekmek+kaşar diye böldü)
    "ekmek dilimi": "Ekmek, beyaz",
    "dilim ekmek": "Ekmek, beyaz",
    "tost ekmeği": "Ekmek, beyaz",
    # Türk usulü tost/börek/hamur işleri (seed_tr_foods 2026-09-27)
    "tost": "Tost",
    "kaşarlı tost": "Kaşarlı tost",
    "peynirli tost": "Kaşarlı tost",
    "poğaça": "Poğaça (sade)",
    "peynirli gözleme": "Gözleme",
    "patatesli gözleme": "Gözleme",
    "ıspanaklı gözleme": "Gözleme",
    "mantı": "Mantı (yoğurtlu)",
    "granola": "Granola",
    # Türkiye'de "yulaf ezmesi" kuru üründür ve kuru tartılır ("50 g yulaf ezmesi");
    # pişmiş lapa (71-76 kcal) 5 kat düşük kalori veriyordu (2026-09-28).
    "yulaf": "Yulaf ezmesi (kuru, pişmemiş)",
    "yulaf ezmesi": "Yulaf ezmesi (kuru, pişmemiş)",
    "kuru yulaf": "Yulaf ezmesi (kuru, pişmemiş)",
    "yulaf lapası": "Yulaf ezmesi, pişmiş",
    "pişmiş yulaf": "Yulaf ezmesi, pişmiş",
    # Yumurta
    "yumurta": "Yumurta, haşlanmış (bütün)",
    "haşlanmış yumurta": "Yumurta, haşlanmış (bütün)",
    "haşlama yumurta": "Yumurta, haşlanmış (bütün)",
    "rafadan yumurta": "Yumurta, haşlanmış (bütün)",
    "pişmiş yumurta": "Yumurta, bütün, pişmiş, yağ türü belirtilmemiş",
    "sahanda yumurta": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "yağda yumurta": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "kızarmış yumurta": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "omlet": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    "çırpılmış yumurta": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    # Süt ürünleri
    "peynir": "Beyaz peynir (Türk tipi, tam yağlı)",
    "yoğurt": "Yoğurt (tam yağlı)",
    "sade yoğurt": "Yoğurt (tam yağlı)",  # -> yağsız yoğurt; sofradaki sade yoğurt tam yağlı
    "ev yoğurdu": "Yoğurt (tam yağlı)",
    "süzme yoğurt": "Yoğurt, süzme (tam yağlı)",
    # Baklagiller (çiğ kayıt yerine pişmiş - kalori ~3 kat farklı)
    "mercimek": "Kırmızı mercimek, haşlanmış",
    "nohut": "Nohut, haşlanmış",
    "yeşil mercimek": "Yeşil mercimek, haşlanmış",
    "kırmızı mercimek": "Kırmızı mercimek, haşlanmış",
    # "kuru fasulye" haşlanmış tanede 140 kcal, yemekte de 140 - sofradaki hali yemek
    "kuru fasulye": "Kuru fasulye yemeği",
    "mercimek köftesi": "Mercimek köftesi",
    "leblebi": "Leblebi",
    "ay çekirdeği": "Ayçiçek çekirdeği, sade, tuzlu",
    "çekirdek": "Ayçiçek çekirdeği, sade, tuzlu",
    "fıstık ezmesi": "Yer fıstığı ezmesi",
    "patlamış mısır": "Patlamış mısır",
    # Pişmiş sebze/tahıl (2026-09-30 foto testi): "haşlanmış brokoli" -> "Haşlanmış erişte
    # ile brokoli grateni"; pişmiş karabuğday kuru taneye (343 kcal, pişmişi 92) gidiyordu.
    "haşlanmış brokoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "pişmiş brokoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "buharda brokoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "buharda pişmiş brokoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "haşlanmış karabuğday": "Karabuğday taneleri, kavrulmuş, pişmiş",
    "pişmiş karabuğday": "Karabuğday taneleri, kavrulmuş, pişmiş",
    "karabuğday pilavı": "Karabuğday taneleri, kavrulmuş, pişmiş",
    "greçka": "Karabuğday taneleri, kavrulmuş, pişmiş",
    # Et / tavuk
    "tavuk": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    # "150 gram tavuk göğsü yedim" pişmiş haldir; çiğ kayıt (120 kcal) ızgaradan (165) %27 düşük
    "tavuk göğsü": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "tavuk göğüs": "Tavuk göğsü, ızgara (pişmiş, derisiz)",  # -> BBQ döner tavuk
    "tavuk göğüs eti": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "tavuk göğsü eti": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "haşlanmış tavuk göğsü": "Tavuk göğsü, haşlanmış/tencere yemeği, deri yenmemiş",
    "somon": "Somon fileto, ızgara/fırınlanmış",
    "ızgara tavuk": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "köfte": "Izgara köfte",
    "patatesli izmir köfte": "İzmir köfte",  # makro farkı küçük (haberturk 192 kcal)
    "fırında izmir köfte": "İzmir köfte",
    "yumurtalı pastırma": "Pastırmalı yumurta",
    "döner": "Et döner (sadece et)",
    "et döner": "Et döner (sadece et)",
    "tavuk döner": "Tavuk döner (sadece et)",
    "dürüm": "Döner dürüm",
    "et şiş": "Kuzu şiş",
    "şiş kebap": "Kuzu şiş",
    # Yemekler: model sıklıkla genel adı yazıyor
    "biber dolması": "Etli biber dolması",
    "yaprak sarma": "Zeytinyağlı yaprak sarma",
    "sarma": "Zeytinyağlı yaprak sarma",
    "taze fasulye": "Zeytinyağlı taze fasulye",
    "ıspanak yemeği": "Zeytinyağlı ıspanak",
    "patates yemeği": "Etli patates",
    "salata": "Mevsim salata",
    "yeşil salata": "Mevsim salata",
    "etli kuru fasulye": "Kuru fasulye yemeği",  # -> "Etli taze fasulye" gidiyordu
    "kuru köfte": "Izgara köfte",  # -> "Kuru üzüm"
    "et dürüm": "Döner dürüm",  # -> çiğ kıyma
    "çökelek": "Lor peyniri (az yağlı)",  # -> soya çökeleği
    # Rus salatası mayonezli patates-sebze salatası; "Rus sosu"na (355 kcal) gidiyordu
    "rus salatası": "Yumurtalı patates salatası, mayonezle yapılmış",
    "protein tozu": "Besleyici toz karışım (EAS Whey Protein Powder)",  # -> smoothie
    "salça": "Domates salçası",
    "salep": "Salep (sütlü)",
    "sahlep": "Salep (sütlü)",
    # Diğer
    "patates kızartması": "Patates, patates kızartması, belirtilmemiş",
    # 2026-09-28 eşleşme taraması: eşiği geçip alakasız kayda gidenler
    "dondurma": "Dondurma, vanilyalı",  # -> "Dondurma, kızarmış"
    "gazoz": "Gazlı içecek, meyve aromalı, kafeinsiz",  # -> viskili zencefilli gazoz
    "whey": "Besleyici toz karışım (EAS Whey Protein Powder)",  # -> peynir altı suyu (sıvı)
    "whey protein": "Besleyici toz karışım (EAS Whey Protein Powder)",
    "ciğer": "Tavuk, karaciğer, tüm sınıflar, pişmiş, tavada kızarmış",  # -> konserve pate
    "tavuk ciğeri": "Tavuk, karaciğer, tüm sınıflar, pişmiş, tavada kızarmış",
    "etli nohut": "Nohut yemeği",  # -> "Etli chili"
    "haşlanmış patates": "Patates, haşlanmış, taze üründen, kabuğu yenmeyen, ilave yağsız",  # -> Porto Riko usulü
    "patates haşlama": "Patates, haşlanmış, taze üründen, kabuğu yenmeyen, ilave yağsız",
    "hindi füme": "Hindi göğsü, dilimlenmiş, önceden paketlenmiş",  # -> "Hindi, sırt"
    "hindi": "Hindi göğsü, pişmiş (derisiz)",  # -> "Hindi, sırt"
    "hindi eti": "Hindi göğsü, pişmiş (derisiz)",
    "hindi jambon": "Hindi göğsü, dilimlenmiş, önceden paketlenmiş",
    # USDA "Ham" kayıtları domuz jambonu; Türkiye'de "jambon" çoğunlukla hindi/dana.
    "jambon": "Hindi jambonu, dilimlenmiş, ekstra yağsız, paketli veya şarküteri",
    # --- İngilizce (2026-10-05): EN arayüzde model İngilizce ad yazıyor; aynı
    # yaygın besinler aynı kayıtlara gitsin. Canlı test: "boiled eggs" -> "Eggs with
    # sucuk", "eggs" -> yalnız yumurta sarısı, "egg" -> kremalı yumurta.
    # İçecekler
    "tea": "Çay (şekersiz)",
    "black tea": "Çay (şekersiz)",
    "sweet tea": "Çay (şekerli)",
    "tea with sugar": "Çay (şekerli)",
    "coffee": "Filtre kahve (şekersiz)",
    "black coffee": "Filtre kahve (şekersiz)",
    "water": "Su, gazsız",
    "sparkling water": "Su, gazlı, sade",
    "mineral water": "Su, gazlı, sade",
    "cola": "Gazlı içecek, kola",
    "coke": "Gazlı içecek, kola",
    "milk": "Süt (tam yağlı)",
    # Tahıllar
    "rice": "Pirinç pilavı (sade)",
    "white rice": "Pirinç pilavı (sade)",
    "plain rice": "Pirinç pilavı (sade)",
    "cooked rice": "Pirinç pilavı (sade)",
    "rice pilaf": "Pirinç pilavı (sade)",
    "plain rice pilaf": "Pirinç pilavı (sade)",
    "pilaf": "Pirinç pilavı (sade)",
    "bread": "Ekmek, beyaz",
    "white bread": "Ekmek, beyaz",
    "slice of bread": "Ekmek, beyaz",
    "bread slice": "Ekmek, beyaz",
    "toast bread": "Ekmek, beyaz",
    "oats": "Yulaf ezmesi (kuru, pişmemiş)",
    "rolled oats": "Yulaf ezmesi (kuru, pişmemiş)",
    "porridge": "Yulaf ezmesi, pişmiş",
    # Yumurta: çoğul ad ("eggs") yalnız sarıya, "boiled eggs" sucuklu yumurtaya gidiyordu
    "egg": "Yumurta, haşlanmış (bütün)",
    "eggs": "Yumurta, haşlanmış (bütün)",
    "boiled egg": "Yumurta, haşlanmış (bütün)",
    "boiled eggs": "Yumurta, haşlanmış (bütün)",
    "hard boiled egg": "Yumurta, haşlanmış (bütün)",
    "hard boiled eggs": "Yumurta, haşlanmış (bütün)",
    "hard-boiled egg": "Yumurta, haşlanmış (bütün)",
    "hard-boiled eggs": "Yumurta, haşlanmış (bütün)",
    "soft boiled egg": "Yumurta, haşlanmış (bütün)",
    "soft boiled eggs": "Yumurta, haşlanmış (bütün)",
    "fried egg": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "fried eggs": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "sunny side up eggs": "Yumurta, bütün, kızarmış, yağ türü belirtilmemiş",
    "omelette": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    "omelet": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    "scrambled egg": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    "scrambled eggs": "Yumurta omleti veya çırpılmış yumurta, yağ türü belirtilmemiş",
    # Süt ürünleri
    "white cheese": "Beyaz peynir (Türk tipi, tam yağlı)",
    "turkish white cheese": "Beyaz peynir (Türk tipi, tam yağlı)",
    "yogurt": "Yoğurt (tam yağlı)",
    "yoghurt": "Yoğurt (tam yağlı)",
    "plain yogurt": "Yoğurt (tam yağlı)",
    "greek yogurt": "Yoğurt, süzme (tam yağlı)",
    "strained yogurt": "Yoğurt, süzme (tam yağlı)",
    # Baklagiller
    "lentils": "Kırmızı mercimek, haşlanmış",
    "red lentils": "Kırmızı mercimek, haşlanmış",
    "green lentils": "Yeşil mercimek, haşlanmış",
    "chickpeas": "Nohut, haşlanmış",
    "peanut butter": "Yer fıstığı ezmesi",
    "popcorn": "Patlamış mısır",
    # Pişmiş sebze/tahıl
    "boiled broccoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "steamed broccoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "cooked broccoli": "Brokoli, taze, pişmiş, yağ eklenmemiş",
    "buckwheat": "Karabuğday taneleri, kavrulmuş, pişmiş",
    "cooked buckwheat": "Karabuğday taneleri, kavrulmuş, pişmiş",
    "boiled potato": "Patates, haşlanmış, taze üründen, kabuğu yenmeyen, ilave yağsız",
    "boiled potatoes": "Patates, haşlanmış, taze üründen, kabuğu yenmeyen, ilave yağsız",
    # Et / tavuk
    "chicken": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "chicken breast": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "grilled chicken": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "grilled chicken breast": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "boiled chicken breast": "Tavuk göğsü, haşlanmış/tencere yemeği, deri yenmemiş",
    "salmon": "Somon fileto, ızgara/fırınlanmış",
    "meatballs": "Izgara köfte",
    "turkish meatballs": "Izgara köfte",
    "doner": "Et döner (sadece et)",
    "doner kebab": "Et döner (sadece et)",
    "chicken doner": "Tavuk döner (sadece et)",
    "shish kebab": "Kuzu şiş",
    "turkey": "Hindi göğsü, pişmiş (derisiz)",
    "turkey breast": "Hindi göğsü, pişmiş (derisiz)",
    # Diğer
    "salad": "Mevsim salata",
    "green salad": "Mevsim salata",
    "french fries": "Patates, patates kızartması, belirtilmemiş",
    "fries": "Patates, patates kızartması, belirtilmemiş",
    "ice cream": "Dondurma, vanilyalı",
    "protein powder": "Besleyici toz karışım (EAS Whey Protein Powder)",
    "tomato paste": "Domates salçası",
    # Aynı gün EN eşleşme taraması: kuru/çiğ ya da alakasız kayda gidenler
    "pasta": "Makarna, pişmiş",
    "spaghetti": "Makarna, pişmiş",  # -> ıspanaklı kuru spagetti (372 kcal)
    "cooked pasta": "Makarna, pişmiş",
    "couscous": "Kuskus, pişmiş",  # -> kuru kuskus (376 kcal, pişmişi 112)
    "bulgur": "Bulgur, pişmiş",  # -> çiğ bulgur
    "tomato": "Domates, çiğ",  # -> yeşil turşu domates
    "tomatoes": "Domates, çiğ",
    "bacon": "Beykon, et türüne göre, pişmiş",  # -> etsiz bacon
    "steak": "Dana eti, biftek",
    "beef steak": "Dana eti, biftek",  # -> Porto Riko usulü soğanlı biftek
    "cookie": "Kurabiye",
    "cookies": "Kurabiye",  # -> fal kurabiyesi
    "mashed potato": "Patates, ezme (püre)",
    "mashed potatoes": "Patates, ezme (püre)",  # -> etli patates
    "tofu": "Tofu, çiğ, sert, kalsiyum sülfat ile hazırlanmış",  # -> kızarmış tofu
    "eggs, boiled": "Yumurta, haşlanmış (bütün)",  # -> haşlanmış ıspanak
    "rice pilaf, plain": "Pirinç pilavı (sade)",  # -> pirinç patlaklı kahvaltılık gevrek
}
