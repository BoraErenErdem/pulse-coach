import re
from typing import Callable, Sequence, TypeVar
from rapidfuzz import fuzz, process

T = TypeVar("T")

_PARENTHETICAL_RE = re.compile(r"\([^)]*\)")


def _strip_parenthetical(text: str) -> str:
    """Modelin sıkça eklediği tanımlayıcı parantez içi ifadeleri (ör. 'chest
    press makinesi (üst göğüs odaklı)', 'peck deck makinesi (göğüs)') kaldırır.
    Bunlar kataloğun kullanmadığı serbest açıklamalar — kelime-eşleştirme
    aşaması TÜM sorgu kelimelerinin kataloğa uymasını istediği için (bkz.
    _contains_all_words), parantez içindeki fazladan kelimeler eşleşmeyi tek
    başına kırabiliyordu (ör. 'chest press makinesi' YALNIZ başına 'Kaldıraç
    Göğüs Presi'ye 95 puanla eşleşirken parantez ekli hâli hiç eşleşmiyordu).
    Canlı testte bulundu (2026-08-08)."""
    stripped = _PARENTHETICAL_RE.sub(" ", text)
    return " ".join(stripped.split())


# Modelin sorgulara sıkça eklediği ama kataloğun tanımlayıcı bir parçası
# OLMAYAN jenerik Türkçe dolgu kelimeleri ("... hareketi", "... hareketinde",
# "... egzersizi" gibi, her çekim eki dahil). Canlı testte bulundu
# (2026-08-31): kullanıcı "skullcrusher hareketinde" dedi, model bunu
# (muhtemelen yanlış çeviri/halüsinasyonla) "kayma hareketi" gibi bambaşka
# bir sorguya dönüştürdü — sorgu kelimeleri ["kayma","hareketi"] oldu.
# "kayma" kataloğun HİÇBİR yerinde geçmiyordu (doğru: eşleşme YOK dönmeliydi)
# ama "hareketi" kelimesi kataloğun 7 kaydında tesadüfen geçtiği ve bunların
# en kısası olan "Kayaklama Hareketi" (Skating) SADECE 2 kelimeden oluştuğu
# için, _one_word_short_matches'in "sorgunun TAM 1 kelimesi eksikse eşleştir"
# kuralı ("kayma" eksik, "hareketi" var → 1 eksik) bu TAMAMEN alakasız kaydı
# 88 puanla (eşiğin üstünde) "kesin eşleşme" sayıp döndürdü — egzersiz
# tamamen yanlış isimle kaydedildi. Kök neden: "hareketi" gibi kataloğun
# neredeyse HER kaydında zımnen var olan (egzersiz zaten bir "hareket"tir)
# jenerik bir kelime, _one_word_short_matches'in beklediği "kataloğun
# KULLANMADIĞI tanımlayıcı ek" (ör. "yaprakları") sinyaliyle KARIŞTIRILIYOR.
# Çözüm: bu jenerik kelimeleri sorgudan (parantez içi gibi) baştan temizle —
# böylece ne tam-kelime ne de 1-eksik aşamasında sahte bir "ortak kelime"
# sinyali üretmezler; gerçek içerik kelimesi ("kayma") hâlâ hiçbir kayda
# uymadığı için doğru şekilde token_sort_ratio'ya (ve muhtemelen eşiğin
# altına) düşer.
_FILLER_WORD_RE = re.compile(r"\b(hareket\w*|egzersiz\w*|için|gibi|üzere)\b", re.IGNORECASE)


# Aynı canlı test turunda (2026-08-31) ikinci bir örnek daha bulundu: "peck
# deck makinesinde göğüs için 3x10 65kg yaptım" sorgusu "peck deck göğüs
# için" oldu - kataloğun kullandığı isim sade "Peck Deck Makinesi", sorgudaki
# "için" (edat, kataloğun HİÇBİR kaydında geçmiyor - saf gramer kelimesi)
# eksik kelime sayısını 2'ye çıkarıp _one_word_short_matches'in (sadece TAM 1
# eksikte çalışır) devreye girmesini engelliyordu, eşleşme tamamen kaçıyordu
# (raw isimle, kataloğa hiç bağlanmadan kaydediliyordu). "için"/"gibi"/
# "üzere" gibi edatlar kataloğun HİÇBİR isminde anlamlı bir bileşen değil -
# "ile" gibi 52 kayıtta geçen ("X ile Y" birleşik isimler) gerçek bir
# kelimeden FARKLI, o yüzden listeye SADECE bu üçü eklendi.
def _strip_filler_words(text: str) -> str:
    stripped = " ".join(_FILLER_WORD_RE.sub(" ", text).split())
    # Sorgunun TAMAMI jenerik kelime(ler)den ibaretse (ör. sadece "hareket")
    # temizlenmiş hâli boş kalır - bu durumda orijinal metne dön, aksi halde
    # sonraki aşamalar boş sorguyla hiçbir şey bulamaz.
    return stripped if stripped else text

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


def _stem_satisfied(word: str, name_lower: str) -> bool:
    """Sadece aynı KÖK'ün (ör. "makine") iki tarafta da geçtiğini ama Türkçe
    hâl/iyelik eki farkı yüzünden düz alt-dize eşleşmesinin bunu göremediği
    dar bir durumu yakalar - "kaldıraç"↔"makine" gibi FARKLI kelimeler
    arasındaki anlam eşdeğerliğini KAPSAMAZ (bkz. _word_satisfied). Canlı
    testte bulundu (2026-08-31): "peck deck makinesinde göğüs için" sorgusu,
    "makinesinde" (bulunma hâli) kelimesi "Peck Deck Makinesi" (iyelik eki)
    içinde literal alt-dize olarak bulunamadığı için eksik sayılıyordu - kök
    ("makine") her iki tarafta da mevcutken salt hâl eki farkı yüzünden
    kelimeyi "eksik" saymak yanlış. Bu fonksiyon hem TAM eşleşme (bkz.
    _word_satisfied) hem de riskli "1 kelime eksik" aşamasında (bkz.
    _missing_word_count) ORTAK kullanılıyor - kapsamı çok dar (tek kök,
    ancak literal "makine" alt-dizesi her iki tarafta da varsa) olduğu için
    ikinci aşamaya sızması güvenli; aşağıdaki kaldıraç/omuz-deltoid gibi
    DAHA GENİŞ anlam-eşdeğerliği eşleşmeleri bilerek SADECE _word_satisfied'da
    (TAM eşleşme) kalıyor, _missing_word_count'a eklenmiyor."""
    return word.startswith("makine") and "makine" in name_lower


def _word_satisfied(word: str, name_lower: str) -> bool:
    if word in name_lower:
        return True
    if _stem_satisfied(word, name_lower):
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
    # Bu eşanlamlılık (farklı KELİME: kaldıraç↔makine) SADECE burada (TAM
    # eşleşme aşamasında) tanınıyor, riskli uzunluk-bazlı aşamaya
    # (_one_word_short_matches) kasıtlı olarak eklenmedi - kapsamı dar
    # tutmak için (katalogda sadece 8 Leverage kaydı var) ve mevcut
    # regresyon testlerini bozma riskini en aza indirmek için.
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
    return sum(
        1 for word in query_words if word not in name_lower and not _stem_satisfied(word, name_lower)
    )


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
    uzadıkça artıyor, ==1 eşiğini aşamıyor.

    Aday birden fazlaysa çağıran taraf (best_match/search) EN KISA ismi
    kazandırıyor - ama besin kataloğunda bu tek başına TEHLİKELİ olabiliyor:
    canlı testte bulundu (2026-08-31), "somon balığı" sorgusu (eksik kelime:
    "balığı") "somon" geçen YÜZLERCE kayıt arasından en kısası olan "Lomi
    somon"a (alakasız bir Hawaii çiğ balık yemeği) kilitlendi; "haşlanmış
    brokoli" ise "Haşlanmış erişte ile brokoli grateni"ye (makarna+peynirli
    karışık yemek, kalori/makro 2-3 kat şişti). İkisi de kataloğun kendi
    "İsim, sıfat" kuralına (bkz. dosya başındaki tasarım notu) UYMUYOR - adı
    sorgunun bir kelimesiyle BAŞLAMIYOR, sadece ORTASINDA/İÇİNDE geçiyor.
    Bu yüzden burada da AYNI ilke uygulanıyor: adaylar arasında sorgunun
    (eksik olmayan) bir kelimesiyle BAŞLAYAN varsa SADECE onlar arasından en
    kısası seçilir - "Lomi somon" (baş harfi "lomi") elenir, "Somon fileto,
    ızgara/fırınlanmış" gibi gerçekten "Somon" ile başlayan adaylar kalır.
    HİÇBİR aday bu şartı sağlamıyorsa (nadir) eski davranışa (tüm adaylar)
    dönülür - bu filtre sonucu ASLA boş liste döndürmez."""
    if len(query_words) < 2:
        return []
    candidates = [item for item, nl in zip(items, names_lower) if _missing_word_count(query_words, nl) == 1]
    if not candidates:
        return candidates
    candidate_names = [nl for nl in names_lower if _missing_word_count(query_words, nl) == 1]
    anchored = [
        item for item, nl in zip(candidates, candidate_names) if _name_starts_with_present_word(nl, query_words)
    ]
    return anchored if anchored else candidates


def _anchor_rank(name_lower: str, query_words: list[str]) -> int | None:
    """`name_lower`nin sorgunun hangi (kayıtta zaten MEVCUT olan) kelimesiyle
    BAŞLADIĞINA göre bir güven sırası döner - küçük sayı daha güvenilir,
    None hiçbir mevcut kelimeyle başlamadığını (çapasız/şüpheli) belirtir.

    0 = sorgunun SON kelimesiyle başlıyor. Türkçe'de doğal sıralama
        "sıfat + isim" (ör. "haşlanmış brokoli"), kataloğun kendi kuralı ise
        tam tersi "İsim, sıfat" (bkz. dosya başındaki tasarım notu) - yani
        çok kelimeli bir sorguda SON kelime genelde asıl konu/isim olur, bu
        yüzden en güvenilir çapa odur.
    1 = sorgunun başka (son olmayan) bir mevcut kelimesiyle başlıyor - daha
        zayıf ama yine de "adı sorgudan biriyle başlıyor" sinyali taşır.

    Canlı testte bulundu (2026-08-31): "haşlanmış brokoli" sorgusunda
    "Haşlanmış erişte ile brokoli grateni" adı "haşlanmış" (sıfat, SON
    kelime DEĞİL) ile başladığı için basit "herhangi bir kelimeyle
    başlıyor mu" kontrolünü YANLIŞLIKLA geçiyordu - oysa gerçek konu
    kelimesi "brokoli" ile hiç başlamıyor. Rütbe ayrımı bu adayı 1. sıraya
    düşürüp, "brokoli" (son kelime) ile başlayan daha sade bir adayın (bkz.
    best_match'teki çağıran kod) rütbe 0 ile onun önüne geçmesini sağlıyor."""
    present = [w for w in query_words if w in name_lower or _stem_satisfied(w, name_lower)]
    if not present:
        return None
    if query_words and query_words[-1] in present and name_lower.startswith(query_words[-1]):
        return 0
    if any(name_lower.startswith(w) for w in present):
        return 1
    return None


def _name_starts_with_present_word(name_lower: str, query_words: list[str]) -> bool:
    """`name_lower`, sorgunun (o kayıtta zaten MEVCUT olan) bir kelimesiyle mi
    BAŞLIYOR - kataloğun kendi "İsim, sıfat" kuralına (bkz. dosya başındaki
    tasarım notu ve _prefix_rank) uyan adayları, sorgunun kelimesi sadece
    ORTASINDA/İÇİNDE geçen ama TAMAMEN başka bir şeyle başlayan (dolayısıyla
    büyük ihtimalle alakasız) adaylardan ayırt etmek için kullanılır (bkz.
    _anchor_rank - burada sadece "çapalı mı değil mi" ikili sonucu lazım
    olan _one_word_short_matches için kullanılıyor)."""
    return _anchor_rank(name_lower, query_words) is not None


# Egzersiz kataloğunda çok sayıda hareketin "bantlı"/"zincirli"/"plakalı"
# direnç-ekipmanı varyantı var (ör. "Squat with Bands", "Bench Press with
# Chains") — bunlar sade hareketin BENZER değil FARKLI bir ekipman versiyonu,
# "Domates, çiğ" gibi zararsız bir nitelik değil. Sorgu bu ekipmanı özellikle
# istemiyorsa bu varyantlar tier-1 tiebreak'te öne çıkmamalı (bkz. _prefix_rank).
_VARIANT_EQUIPMENT_MARKERS = ("bant", "band", "zincir", "chain", "plaka", "plate")


def _has_variant_marker(text: str) -> bool:
    return any(marker in text for marker in _VARIANT_EQUIPMENT_MARKERS)


def _prefix_rank(name_lower: str, q: str) -> int:
    """Prefix eşleşmeleri arasında sıralama için ÜÇ kademe:
    0 = tam eşleşme ya da kataloğun 'İsim, sıfat' kalıbına uyan nitelikli
        varyant (ör. sorgu "domates" için "Domates, çiğ" — AYNI temel
        besinin/hareketin bir çeşidi).
    1 = normal devam (virgülsüz ama ekipman-varyantı belirtmeyen, ör. sorgu
        "domates" için "Domates tozu" — tamamen farklı bir ürün, sadece ilk
        kelimesi ortak; ya da sorgu zaten bant/zincir/plaka istiyorsa o
        varyant da burada kalır).
    2 = SADECE sorgu istemediği hâlde bant/zincir/plaka gibi FARKLI bir
        direnç-ekipmanı varyantı belirten devam (ör. sorgu "squat" için
        "Squat with Bands") — kanonik/sade hareketin ÖNÜNE geçmemesi için
        1'in altına itilir.
    Gerçek regresyon 1 (2026-08-01): "domates" sorgusu, sadece EN KISA isim
    kazandığı için "Domates tozu"na (kurutulmuş toz, 302 kcal/100g) eşleşip
    gerçek domatesten (~18 kcal/100g) ~17x yanlış kalori değeri döndürdü —
    uzunluk tek başına "en kanonik" için güvenilir bir sinyal değil.
    Gerçek regresyon 2 (2026-08-08): aynı sınıf hata egzersiz kataloğunda da
    bulundu — "squat"/"bench press"/"deadlift"/"shoulder press" gibi çok
    yaygın sorgularda, kataloğa sade bir kanonik kayıt eklenmemiş olduğu
    durumlarda (ör. squat için "Squat Jerk" hariç) uzunluk tek başına
    tamamen farklı bir ekipman varyantını ("...with Bands"/"...with Chains")
    kanonik hareketin önüne geçiriyordu."""
    if len(name_lower) == len(q) or name_lower[len(q)] == ",":
        return 0
    suffix = name_lower[len(q):]
    if _has_variant_marker(suffix) and not _has_variant_marker(q):
        return 2
    return 1


def best_match(query: str, items: Sequence[T], name_of: Callable[[T], str]) -> tuple[T | None, float]:
    if not items:
        return None, 0.0

    q = tr_lower(_strip_filler_words(_strip_parenthetical(query)).strip())
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
            word_match_names = [nl for nl in names_lower if _contains_all_words(query_words, nl)]
            # "İsim başı" (anchor) denetimi SADECE tüm kelimeleri SAF alt-dize
            # eşleşmesiyle (hiçbir eşanlamlı/kök kuralı OLMADAN) bulan
            # adaylara uygulanır. kaldıraç↔makine, omuz↔deltoid gibi ÖZEL
            # olarak curate edilmiş eşanlamlılar (bkz. _word_satisfied) zaten
            # güvenilir - adları sorgudaki kelimeyle ASLA başlamaz (ör.
            # "Kaldıraç Göğüs Presi" hiçbir zaman sorgudaki "makinesi" ile
            # başlamaz), bu denetime tabi tutulurlarsa HER ZAMAN yanlışlıkla
            # "şüpheli" sayılıp daha kötü bir adaya kaybederlerdi (canlı
            # testte tam bu şekilde regresyon oldu, 2026-08-31).
            uses_synonym = any(not all(w in nl for w in query_words) for nl in word_match_names)
            if not uses_synonym:
                ranked_exact = [
                    (item, _anchor_rank(nl, query_words)) for item, nl in zip(word_matches, word_match_names)
                ]
                ranked_exact = [(item, r) for item, r in ranked_exact if r is not None]
                best_exact_rank = min((r for _, r in ranked_exact), default=None)
                if best_exact_rank == 0:
                    # En güvenilir sinyal - sorgunun SON (genelde asıl konu)
                    # kelimesiyle başlayan bir tam eşleşme var, buna güven.
                    pool = [item for item, r in ranked_exact if r == 0]
                    return min(pool, key=lambda item: len(name_of(item))), 95.0
                # best_exact_rank 1 (zayıf çapa) ya da None (çapasız) -
                # ŞÜPHELİ, "1 kelime eksik" katmanında DAHA İYİ çapalı bir
                # aday var mı diye bak. Canlı testte bulundu (2026-08-31):
                # "haşlanmış brokoli" sorgusu kataloğun TEK bir kaydında
                # ("Haşlanmış erişte ile brokoli grateni" - makarna+peynirli
                # karışık bir yemek) her iki kelimeyi de İÇERİYORDU (rank=1,
                # "haşlanmış" sıfatıyla başlıyor); oysa "1 kelime eksik"
                # katmanında adı gerçekten "Brokoli" (SON kelime) ile
                # BAŞLAYAN, rank=0, çok daha güvenilir sade bir aday vardı.
                fallback_short = _one_word_short_matches(query_words, items, names_lower)
                ranked_short = [
                    (item, _anchor_rank(tr_lower(name_of(item)), query_words)) for item in fallback_short
                ]
                ranked_short = [(item, r) for item, r in ranked_short if r is not None]
                best_short_rank = min((r for _, r in ranked_short), default=None)
                if best_short_rank is not None and (best_exact_rank is None or best_short_rank < best_exact_rank):
                    pool = [item for item, r in ranked_short if r == best_short_rank]
                    return min(pool, key=lambda item: len(name_of(item))), 90.0
                if best_exact_rank is not None:
                    pool = [item for item, r in ranked_exact if r == best_exact_rank]
                    return min(pool, key=lambda item: len(name_of(item))), 95.0
                # Hiçbir aday (ne tam eşleşme ne 1-eksik) çapalı değil -
                # eski davranışa (tüm tam eşleşmeler, en kısa kazanır) dön.
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

    q = tr_lower(_strip_filler_words(_strip_parenthetical(query)).strip())
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
