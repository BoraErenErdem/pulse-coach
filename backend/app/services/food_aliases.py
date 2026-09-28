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
    "su": "Su, gazsız (NFS)",
    "içme suyu": "Su, gazsız (NFS)",
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
    "patlamış mısır": "Patlamış mısır, NFS",
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
}
