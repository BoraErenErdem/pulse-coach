"""Salonda yaygın egzersiz adlarının katalogdaki standart kayda sabit eşlemesi.

food_aliases.py ile aynı mekanizma (bkz. BilingualCatalog aliases): 2026-09-27
canlı testte "latpulldown" -> "Tek Kollu Lat Aşağı Çekiş" (tek kollu varyant)
kaydedildi; kullanıcının geçmişi "Geniş Tutuş Lat Aşağı Çekme" olduğu için
rekor/ilerleme karşılaştırması da yanlış harekete bağlandı. Benzer şekilde
"biceps curl" -> "Eğimli İç Pazı Curl'ü", "lat pull down" -> "Temiz Çekiş",
"chest fly" -> "Koşu Serbest Bırakmalı Göğüs İtme", "leg curl" -> "Topla
Bacak Kıvırma", "row" -> "Kızak Kürek Çekme" gidiyordu. Genel fuzzy
algoritmaya dokunulmadı; yalnız bu TAM sorgular için geçerli.

Anahtar: tr_lower + tek boşluk. Değer: katalogdaki name_tr (benzersiz).
"""

_WIDE_LAT = "Geniş Tutuş Lat Aşağı Çekme"
_DB_CURL = "Dambıl Pazı Kıvırma"

EXERCISE_ALIASES: dict[str, str] = {
    # Sırt
    "lat pulldown": _WIDE_LAT,
    "latpulldown": _WIDE_LAT,
    "lat pull down": _WIDE_LAT,
    "lat pull-down": _WIDE_LAT,
    "lat çekiş": _WIDE_LAT,
    "lat çekme": _WIDE_LAT,
    "lat pulldown makinesi": _WIDE_LAT,
    "row": "Oturarak Kablo Kürek Çekme",
    "kablo row": "Oturarak Kablo Kürek Çekme",
    "cable row": "Oturarak Kablo Kürek Çekme",
    "barbell row": "Eğilerek Barbell Kürek Çekme",
    "t bar row": "Tutacaklı T-Bar Kürek Çekme",
    "t-bar row": "Tutacaklı T-Bar Kürek Çekme",
    # Kol
    "biceps curl": _DB_CURL,
    "bicep curl": _DB_CURL,
    "pazı curl": _DB_CURL,
    "dumbell curl": _DB_CURL,
    # Göğüs / omuz
    "chest fly": "Dambıl Kanat Açma (Flyes)",
    "dumbbell fly": "Dambıl Kanat Açma (Flyes)",
    "incline bench press": "Orta Tutuşla Eğimli Sehpası İtmesi",
    "göğüs pres": "Makine Sehpada Pres",
    "yan kaldırma": "Yanal Kaldırma",
    "overhead press": "Ayakta Asker Presi (Military Press)",
    # Bacak / karın
    "leg curl": "Yatarak Bacak Kıvırma (Curl)",
    "calf raise": "Ayakta Baldır Kaldırmaları",
    "lunge": "Dambıl Hamle (Lunge)",
    "hamle": "Dambıl Hamle (Lunge)",
}
