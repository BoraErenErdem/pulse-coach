"""Egzersiz/besin kataloğundaki kontrollü kelime dağarcığı alanlarının sabit
TR çevirileri — bunlar LLM'e hiç gönderilmez, hızlı ve %100 doğru olması için
elle yazılmıştır. `translate_catalog.py` (LLM ile serbest metin çevirisi) ve
`seed_catalogs.py` (DB'ye yazma) tarafından ortak kullanılır."""

EXERCISE_CATEGORY_TR = {
    "strength": "kuvvet",
    "stretching": "esneklik",
    "plyometrics": "pliometrik",
    "powerlifting": "halter (güç)",
    "olympic weightlifting": "halter (olimpik)",
    "strongman": "strongman",
    "cardio": "kardiyo",
}

EQUIPMENT_TR = {
    "barbell": "barbell",
    "dumbbell": "dambıl",
    "other": "diğer",
    "body only": "vücut ağırlığı",
    "cable": "kablo makinesi",
    "machine": "makine",
    "kettlebells": "kettlebell",
    "bands": "direnç bandı",
    "medicine ball": "sağlık topu",
    "exercise ball": "pilates topu",
    "foam roll": "foam roller",
    "e-z curl bar": "EZ curl bar",
    None: None,
}

MUSCLE_TR = {
    "abdominals": "karın kasları",
    "abductors": "kalça abdüktörleri",
    "adductors": "kalça addüktörleri",
    "biceps": "biceps",
    "calves": "baldır",
    "chest": "göğüs",
    "forearms": "ön kol",
    "glutes": "kalça",
    "hamstrings": "arka bacak (hamstring)",
    "lats": "sırt kanatları (lat)",
    "lower back": "bel (alt sırt)",
    "middle back": "orta sırt",
    "neck": "boyun",
    "quadriceps": "ön bacak (quadriceps)",
    "shoulders": "omuz",
    "traps": "trapez",
    "triceps": "triceps",
}

LEVEL_TR = {
    "beginner": "başlangıç",
    "intermediate": "orta",
    "expert": "ileri",
}

FORCE_TR = {
    "push": "itme",
    "pull": "çekme",
    "static": "statik",
    None: None,
}

MECHANIC_TR = {
    "compound": "bileşik",
    "isolation": "izole",
    None: None,
}

FOOD_CATEGORY_TR = {
    "Beef Products": "Sığır Eti Ürünleri",
    "Vegetables and Vegetable Products": "Sebzeler",
    "Baked Products": "Fırın Ürünleri",
    "Lamb, Veal, and Game Products": "Kuzu, Dana ve Av Eti Ürünleri",
    "Poultry Products": "Kanatlı Eti Ürünleri",
    "Beverages": "İçecekler",
    "Sweets": "Tatlılar",
    "Fruits and Fruit Juices": "Meyveler ve Meyve Suları",
    "Pork Products": "Domuz Eti Ürünleri",
    "Dairy and Egg Products": "Süt Ürünleri ve Yumurta",
    "Legumes and Legume Products": "Baklagiller",
    "Finfish and Shellfish Products": "Balık ve Deniz Ürünleri",
    "Soups, Sauces, and Gravies": "Çorbalar, Soslar ve Suyu Katılan Yemekler",
    "Fats and Oils": "Yağlar",
    "Breakfast Cereals": "Kahvaltılık Gevrekler",
    "Cereal Grains and Pasta": "Tahıllar ve Makarna",
    "Snacks": "Atıştırmalıklar",
    "Sausages and Luncheon Meats": "Şarküteri Ürünleri",
    "Nut and Seed Products": "Kuruyemiş ve Tohumlar",
    "Spices and Herbs": "Baharat ve Otlar",
}


def join_tr(values: list[str], vocab: dict[str, str]) -> str:
    """Bir liste (ör. primaryMuscles) için TR karşılıkları virgülle birleştirir,
    sözlükte olmayan bir değer gelirse olduğu gibi (İngilizce) bırakır."""
    return ", ".join(vocab.get(v, v) for v in values)
