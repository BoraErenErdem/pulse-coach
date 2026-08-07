from typing import Callable, Sequence, TypeVar
from rapidfuzz import fuzz, process

T = TypeVar("T")

"""Türkçe isim tabanlı kataloglarda (besin, egzersiz) kullanılan ortak fuzzy
eşleştirme mantığı. rapidfuzz'ın varsayılan WRatio skorlayıcısı, kısa bir
kullanıcı sorgusunu (ör. "yoğurt") yüzlerce uzun/detaylı USDA açıklaması
arasında ararken güvenilir sonuç vermiyordu — sorguyla alakasız ama yüzeysel
karakter benzerliği yüksek kayıtları öne çıkarıyordu (ör. "kırmızı mercimek"
sorgusu "Armut, çiğ, kırmızı anjou"yu buluyordu, çünkü WRatio kısmi
karakter/alt-dize örtüşmesine kelime anlamından daha fazla ağırlık veriyor).

Bunun yerine üç aşamalı bir strateji kullanılıyor: önce sorguyla BAŞLAYAN en
kısa (en kanonik) kaydı, yoksa sorgunun TÜM kelimelerini (sırasız) İÇEREN en
kısa kaydı, o da yoksa token_sort_ratio'ya göre en yakınını dener. Kelime
sırasından bağımsız arama önemli: kullanıcılar doğal sırayla yazıyor ("tam
yağlı süt"), katalog ise "İsim, sıfat" kalıbını kullanıyor ("Süt, tam yağlı")
— düz alt-dize eşleşmesi bu durumda ya hiç bulamıyor ya da katalogtaki uzun,
alakasız bir açıklamanın içinde tesadüfen aynı kelime dizisi geçtiği için
yanlış (ama çok daha uzun) bir kayda kilitleniyordu.

İkinci aşama (tüm kelimeler) başarısız olursa, sorgunun TAM OLARAK TEK
kelimesi hariç tamamını içeren bir kayıt aranır (ör. fotoğraf analizinin
eklediği "yaprakları"/"dilimleri" gibi kataloğun kullanmadığı tanımlayıcı
ekler) — bkz. `_one_word_short_matches`."""


def tr_lower(text: str) -> str:
    # Python'un varsayılan str.lower()'ı Türkçe İ/I/ı/i ayrımını doğru
    # yapmıyor ('I'.lower() == 'i', Türkçe'de ise 'I'.lower() == 'ı' olmalı).
    return text.replace("İ", "i").replace("I", "ı").lower()


def _word_satisfied(word: str, name_lower: str) -> bool:
    if word in name_lower:
        return True
    # "makine"/"makinesi"/"makinesinde" gibi Türkçe çekimler egzersiz
    # kataloğunda HİÇ geçmiyor - kaynak veri (wger/ExerciseDB) plakalı/
    # kaldıraçlı makineleri "Leverage" (Türkçeye "Kaldıraç" olarak çevrilmiş)
    # kategorisiyle adlandırıyor. Canlı testte bulundu (2026-08-07):
    # "chest press makinesi" hiçbir kayıtta "makinesi" geçmediği için TAM
    # eşleşmeyi hiç yakalayamıyor, riskli "1 kelime eksik + en kısa isim
    # kazanır" aşamasına düşüp alakasız ama daha kısa "Kablo Göğüs Presi"yi
    # (Cable Chest Press) seçiyordu - oysa kullanıcının kastettiği plakalı/
    # kaldıraçlı makine "Kaldıraç Göğüs Presi" (Leverage Chest Press) idi.
    # Bu eşanlamlılık SADECE burada (TAM eşleşme aşamasında) tanınıyor,
    # riskli uzunluk-bazlı aşamaya (_one_word_short_matches) kasıtlı olarak
    # eklenmedi - kapsamı dar tutmak için (katalogda sadece 8 Leverage kaydı
    # var) ve mevcut regresyon testlerini bozma riskini en aza indirmek için.
    if word.startswith("makine") and ("kaldıraç" in name_lower or "leverage" in name_lower):
        return True
    # Aynı sınıf boşluk (2026-08-07, aynı canlı test turunda bulundu): kullanıcılar
    # günlük dilde "omuz" der, katalog çevirisi anatomik terim "deltoid" kullanıyor
    # (name_en'de zaten "Deltoid/Delt" geçiyor) - "arka omuz" sorgusu bu yüzden
    # "deltoid" içeren doğru adaylara hiç ulaşamıyor, tam eşleşme kuramayınca
    # alakasız ama "arka" kelimesini de içeren başka bir kayda (ör. "Boyun Arkası
    # Omuz İtme" - bambaşka bir hareket, push press) kayıyordu. Kapsam dar (katalogda
    # sadece 9 "deltoid" kaydı var).
    if word in ("omuz", "omuzu", "omuzda", "omuza") and "deltoid" in name_lower:
        return True
    return False


def _contains_all_words(query_words: list[str], name_lower: str) -> bool:
    return all(_word_satisfied(word, name_lower) for word in query_words)


def _missing_word_count(query_words: list[str], name_lower: str) -> int:
    return sum(1 for word in query_words if word not in name_lower)


def _one_word_short_matches(query_words: list[str], items: Sequence[T], names_lower: list[str]) -> list[T]:
    """Sorgunun TAM OLARAK TEK kelimesi hariç tamamını içeren kayıtları
    bulur (ör. modelin fotoğraf analizinde doğal olarak eklediği ama
    kataloğun kullanmadığı tanımlayıcı ekler: "ıspanak YAPRAKLARI", "kavrulmuş
    badem DİLİMLERİ" — "Ispanak, çiğ"/"Badem, ballı kavrulmuş" kalan
    kelimelerin tümünü içeriyor). Kataloğun her kaydına göre AYRI AYRI
    değerlendirilir (kelimenin kataloğun BAŞKA bir yerinde geçip geçmediğine
    bakan önceki bir tasarım, ~7800 satırlık gerçek katalogda neredeyse her
    kelimenin bir yerlerde tesadüfen geçmesi yüzünden işe yaramıyordu — canlı
    testte yakalandı). "Tam olarak 1 kelime eksik" şartı, uzun/gürültülü
    sorguların (ör. "zzzzz not an exercise at all") yanlışlıkla bir kayda
    zorla eşleşmesini de doğal olarak engelliyor: eksik kelime sayısı sorgu
    uzadıkça artıyor, ==1 eşiğini aşamıyor."""
    if len(query_words) < 2:
        return []
    return [item for item, nl in zip(items, names_lower) if _missing_word_count(query_words, nl) == 1]


def _prefix_rank(name_lower: str, q: str) -> int:
    """Prefix eşleşmeleri arasında sıralama için: 0 = tam eşleşme ya da
    kataloğun 'İsim, sıfat' kalıbına uyan nitelikli varyant (ör. sorgu
    "domates" için "Domates, çiğ" — AYNI temel besinin bir çeşidi), 1 = diğer
    (sorguyla başlayan ama virgülsüz devam eden bileşik/farklı bir ürün, ör.
    "Domates tozu" — tamamen farklı bir ürün, sadece ilk kelimesi ortak).
    Gerçek regresyon (2026-08-01): "domates" sorgusu, sadece EN KISA isim
    kazandığı için "Domates tozu"na (kurutulmuş toz, 302 kcal/100g) eşleşip
    gerçek domatesten (~18 kcal/100g) ~17x yanlış kalori değeri döndürdü —
    uzunluk tek başına "en kanonik" için güvenilir bir sinyal değil."""
    if len(name_lower) == len(q) or name_lower[len(q)] == ",":
        return 0
    return 1


def best_match(query: str, items: Sequence[T], name_of: Callable[[T], str]) -> tuple[T | None, float]:
    if not items:
        return None, 0.0

    q = tr_lower(query.strip())
    if q:
        prefix_matches = [item for item in items if tr_lower(name_of(item)).startswith(q)]
        if prefix_matches:
            best = min(
                prefix_matches,
                key=lambda item: (_prefix_rank(tr_lower(name_of(item)), q), len(name_of(item))),
            )
            return best, 100.0

        query_words = q.split()
        names_lower = [tr_lower(name_of(item)) for item in items]
        word_matches = [item for item, nl in zip(items, names_lower) if _contains_all_words(query_words, nl)]
        if word_matches:
            return min(word_matches, key=lambda item: len(name_of(item))), 95.0

        one_word_short = _one_word_short_matches(query_words, items, names_lower)
        if one_word_short:
            return min(one_word_short, key=lambda item: len(name_of(item))), 88.0

    names = [name_of(item) for item in items]
    match = process.extractOne(query, names, scorer=fuzz.token_sort_ratio)
    if match is None:
        return None, 0.0
    _name, score, index = match
    return items[index], score


def search(query: str, items: Sequence[T], name_of: Callable[[T], str], limit: int = 5) -> list[T]:
    if not items:
        return []

    q = tr_lower(query.strip())
    ordered: list[T] = []
    seen: set[int] = set()

    def add(candidates):
        for item in candidates:
            key = id(item)
            if key not in seen:
                ordered.append(item)
                seen.add(key)

    if q:
        prefix_matches = sorted(
            (item for item in items if tr_lower(name_of(item)).startswith(q)),
            key=lambda item: (_prefix_rank(tr_lower(name_of(item)), q), len(name_of(item))),
        )
        add(prefix_matches)

        query_words = q.split()
        names_lower = [tr_lower(name_of(item)) for item in items]

        if len(ordered) < limit:
            word_matches = sorted(
                (item for item, nl in zip(items, names_lower) if _contains_all_words(query_words, nl)),
                key=lambda item: len(name_of(item)),
            )
            add(word_matches)

        if len(ordered) < limit:
            one_word_short = sorted(
                _one_word_short_matches(query_words, items, names_lower),
                key=lambda item: len(name_of(item)),
            )
            add(one_word_short)

    if len(ordered) < limit:
        names = [name_of(item) for item in items]
        fuzzy = process.extract(query, names, limit=limit, scorer=fuzz.token_sort_ratio)
        add(items[index] for _name, _score, index in fuzzy)

    return ordered[:limit]
