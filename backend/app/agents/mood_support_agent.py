import re

from langchain_core.tools import BaseTool, tool

CRISIS_RESPONSE = """
Bunu benimle paylaştığın için teşekkür ederim, söylediklerini önemsiyorum. Ama bu \
konuda sana gerçekten yardımcı olabilecek kişi ben değilim. Eğer şu anda kendine \
zarar verme düşüncesi yaşıyorsan ya da hayati bir tehlike hissediyorsan lütfen hemen \
112'yi ara ya da yanındaki birine ulaş. Bir psikolog veya psikiyatristle görüşmek bu \
süreçte gerçek bir fark yaratabilir; yalnız değilsin. Ben burada sağlık ve fitness \
rutinini desteklemek için varım, bu konuda en doğru desteği bir uzmandan alman çok \
önemli.
""".strip()

MOOD_SUPPORT_GUIDANCE = """
Kullanıcının şu anki duygusunu önce olduğu gibi kabul et, geçersiz kılma ("bu kadar \
da abartma" gibi ifadelerden kaçın). Hedeften sapmayı (antrenman atlama, plan dışı \
yeme vb.) başarısızlık değil, sürecin doğal bir parçası olarak çerçevele. Aşırı \
iyimser/yapay pozitiflikten kaçın; önce duyguyu kabul et, sonra nazikçe ileri \
bakışlı bir çerçeve sun. Terapi yapma, psikolojik teşhis koyma ("sende anksiyete \
var" gibi ifadeler kullanma), ilaç veya tedavi tavsiyesi verme, kullanıcının neden \
böyle hissettiğine dair kendi yorumunu dayatma — sadece söylediklerini yansıtıp \
destek ver. Sıcak, sakin, yargılamayan ve kısa (2-4 cümle) bir dille yanıt ver.
""".strip()

_TR_TRANSLATION = str.maketrans("çğıöşü", "cgiosu")

# Harf olmayan her şeyi (virgül, satır sonu, fazladan boşluk, noktalama vb.)
# tek bir boşluğa indirger — kullanıcı "kendimi, öldürmek istiyorum" ya da
# satır sonuyla bölünmüş bir cümle yazsa bile çok kelimeli kalıpların
# eşleşmesi bozulmasın diye.
_NON_LETTER_RE = re.compile(r"[^a-z]+")


def _normalize(message: str) -> str:
    # Python'ın varsayılan str.lower()'ı Türkçe büyük "İ" (U+0130) karakterini
    # "i" + görünmez birleşen nokta (U+0307) ikilisine çeviriyor, düz "i" değil
    # — bu da örn. "İntihar" gibi cümle başı büyük yazılan (Türkçe'de doğal/
    # varsayılan) kritik kelimelerin eşleşmesini kırıp tamamen kaçırılmasına
    # yol açıyordu. .lower() çağrılmadan ÖNCE "İ"yi düz "i"ye çevirerek bu
    # tuzak bertaraf ediliyor.
    text = message.replace("İ", "i").lower().translate(_TR_TRANSLATION)
    return _NON_LETTER_RE.sub(" ", text).strip()


# Kasıtlı olarak yüksek recall / düşük precision: yanlış alarm kabul edilebilir,
# kaçırma kabul edilemez. Tek kelimelik/bölünmesi anlamsız kökler basit
# alt-dize olarak, geri kalan HER ŞEY ise aşağıdaki _CRISIS_REGEXES'te
# gap-toleranslı regex olarak tanımlanır — çünkü kullanıcılar iki kelime
# arasına doğal olarak "artık", "gerçekten", "cidden", "çok", "hiçbir" gibi
# dolgu kelimeleri sıkıştırır (ör. "hiçbir şeyden ARTIK zevk almıyorum") ve
# saf sabit-cümle alt-dize eşleşmesi bunu kaçırır (test sırasında doğrulandı).
_CRISIS_PHRASES = (
    "intihar",
    "depresyonday",
)

# Konu/ilk parça ile ikinci parça arasına kullanıcının doğal konuşma dilinde
# sıkça eklediği dolgu kelimeleri ("artık", "cidden", "gerçekten", "çok",
# "hiçbir" vb.) girebilir — bu yüzden kritik ifadeler, aralarında en fazla 2
# kelimelik boşluğa izin veren regex kalıpları olarak tanımlanır. {0,2}
# sınırı, kalıbın tamamen alakasız/uzak kelimeler arasında rastgele
# eşleşmesini önler (ör. uzun, alakasız bir paragrafın iki ucundaki
# kelimeleri birleştirmez).
_GAP = r"\s+(?:\S+\s+){0,2}"


def _flex(*parts: str) -> str:
    """Parçaları (her biri kendi içinde tek boşlukla ayrılmış literal bir
    alt-cümle olabilir) aralarında _GAP toleransıyla birleştirir."""
    return _GAP.join(re.escape(part) for part in parts)


_CRISIS_REGEXES = tuple(
    re.compile(pattern)
    for pattern in (
        # Kendine zarar verme / intihar düşüncesi
        _flex("kendime", "zarar"),
        _flex("kendimi", "oldur"),
        r"kendimi" + _GAP + r"kes(?:iyorum|ecegim|tim|mek|erim)\b",
        r"bilegimi" + _GAP + r"kes(?:iyorum|ecegim|tim|mek)\b",
        _flex("canima", "kiy"),
        _flex("hayatima", "son ver"),
        _flex("hayata", "veda"),
        r"olme(?:k|yi)" + _GAP + r"(?:istiyorum|dusunuyorum)",
        r"yasama(?:k|yi)" + _GAP + r"istemiyorum",
        _flex("bir daha", "uyanmak istemiyorum"),
        _flex("olsem", "daha iyi"),
        _flex("olesim", "geliyor"),
        # "yasamanin anlami yok" / "... bir anlami yok" / "... hicbir anlami
        # yok" varyantlarının HEPSİNİ tek desende kapsar ("bir"/"hicbir" zaten
        # gap ile dolgu kelimesi olarak yakalanır).
        _flex("yasamanin", "anlami yok"),
        _flex("artik", "dayanamiyorum"),
        # Uzun süreli çökkünlük
        _flex("hicbir seyden", "zevk almiyorum"),
        _flex("aylardir", "kendimi kotu hissediyorum"),
        _flex("surekli", "degersiz hissediyorum"),
        _flex("kendimi", "degersiz hissediyorum"),
        _flex("yasamaktan", "yoruldum"),
        _flex("yasamaktan", "biktim"),
        _flex("hicbir seye", "anlam veremiyorum"),
        _flex("gunlerdir", "yataktan cikamiyorum"),
        # Yeme bozukluğu belirtileri
        _flex("kendimi", "kustur"),
        r"kendimi" + _GAP + r"ac" + _GAP + r"birak",
        _flex("gunlerdir", "hicbir sey yemedim"),
        _flex("gunlerdir", "bir sey yemedim"),
        _flex("yemek", "yemekten", "korkuyorum"),
        _flex("yemek", "yemeyi", "reddediyorum"),
    )
)


def check_crisis_indicators(message: str) -> bool:
    """Ham kullanıcı mesajını deterministik anahtar kelime/regex kalıplarıyla
    tarar. Orchestrator LLM'i hiç çağrılmadan ÖNCE, ham mesaj üzerinde
    çalıştırılmalıdır — tespit LLM'in muhakemesine bırakılmaz."""
    normalized = _normalize(message)
    if any(phrase in normalized for phrase in _CRISIS_PHRASES):
        return True
    return any(pattern.search(normalized) for pattern in _CRISIS_REGEXES)


def build_mood_support_tools() -> list[BaseTool]:
    @tool
    def generate_supportive_response() -> str:
        """Kullanıcı kötü bir gün geçirdiğini, motivasyonunu kaybettiğini, üzgün ya da \
        yorgun hissettiğini veya hedeflerinden saptığını (örn. antrenmanı atladım, \
        plan dışı bir şey yedim) belirttiğinde bu aracı çağır. Bu araç sana nasıl \
        yanıt vermen gerektiğine dair kurallar döndürür; kullanıcının söylediklerini \
        bu kurallara göre, kendi cümlelerinle, sıcak ve yargılamayan bir dille \
        yanıtla."""
        return MOOD_SUPPORT_GUIDANCE

    return [generate_supportive_response]
