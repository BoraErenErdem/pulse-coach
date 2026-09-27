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
olmayan yemekler (menemen, börek, yeşil salata) BİLEREK listede yok - yanlış
bir kayda yönlendirmek tam da düzeltilen sorun olurdu.
"""

FOOD_ALIASES: dict[str, str] = {
    # İçecekler
    "çay": "Çay (şekersiz)",
    "siyah çay": "Çay (şekersiz)",
    "demli çay": "Çay (şekersiz)",
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
    "tost": "Izgara peynirli sandviç, NFS",
    "kaşarlı tost": "Izgara peynirli sandviç, NFS",
    "peynirli tost": "Izgara peynirli sandviç, NFS",
    "yulaf": "Yulaf (USDA Gıda Dağıtım Programı için gıdalar dahil)",
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
    # Baklagiller (çiğ kayıt yerine pişmiş - kalori ~3 kat farklı)
    "mercimek": "Kırmızı mercimek, haşlanmış",
    "nohut": "Nohut, haşlanmış",
    # Et / tavuk
    "tavuk": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "ızgara tavuk": "Tavuk göğsü, ızgara (pişmiş, derisiz)",
    "köfte": "Izgara köfte",
    "döner": "Gyro sandviçi",
    # Diğer
    "patates kızartması": "Patates, patates kızartması, belirtilmemiş",
}
