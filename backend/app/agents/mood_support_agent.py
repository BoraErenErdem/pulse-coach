import re
from collections.abc import Callable
from dataclasses import dataclass

from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session

from app.services import mood_service

CRISIS_RESPONSE_TR = """
Bunu benimle paylaştığın için teşekkür ederim, söylediklerini önemsiyorum. Ama bu \
konuda sana gerçekten yardımcı olabilecek kişi ben değilim. Eğer şu anda kendine \
zarar verme düşüncesi yaşıyorsan ya da hayati bir tehlike hissediyorsan lütfen hemen \
112'yi ara ya da yanındaki birine ulaş. Bir psikolog veya psikiyatristle görüşmek bu \
süreçte gerçek bir fark yaratabilir; yalnız değilsin. Ben burada sağlık ve fitness \
rutinini desteklemek için varım, bu konuda en doğru desteği bir uzmandan alman çok \
önemli.
""".strip()

# Faz 3: kriz protokolü, orchestrator LLM'i hiç çağrılmadan sabit metin
# döndürüyor (bkz. app/agents/orchestrator.py::run_orchestrator) - bu yüzden
# LLM'in "kullanıcının dilinde yanıt ver" talimatına güvenilemez, İngilizce
# tercih eden bir kullanıcı kriz anında Türkçe bir metinle karşılaşmamalı.
#
# 2026-08-12 kullanıcı kararı: TR şablonu (yukarıda) SADECE 112 kullanmaya
# devam ediyor (araştırma gerekçesi hâlâ geçerli, bkz. dosyanın en üstündeki
# "KRİZ HATTI NUMARASI ARAŞTIRMASI" notu). Ama İngilizce tercih eden
# kullanıcı kitlesi genelde Türkiye'ye özgü olmayan/uluslararası bir kitle
# olduğu için, EN şablonuna kullanıcının AÇIK KARARIYLA ABD'nin resmî,
# kongre onaylı ulusal kriz hattı (988 Suicide & Crisis Lifeline) ve Crisis
# Text Line (741741) eklendi — bunlar TR tarafındaki gibi belirsiz/blog
# kaynaklı numaralar DEĞİL, ABD hükümetinin kendi resmî kaynağında (988lifeline.org)
# doğrulanmış numaralar. Önceden LLM bu numaraları serbest yanıtta zaten
# kendiliğinden üretiyordu (kriz tespiti EN tarafta boşluk bırakınca) — şimdi
# aynı bilgi deterministik, sabit şablonda, halüsinasyon riski olmadan veriliyor.
CRISIS_RESPONSE_EN = """
Thank you for sharing this with me, what you're going through matters. But I'm \
not the right one to really help you with this. If you're having thoughts of \
harming yourself right now, or you feel like you're in danger, please reach out \
immediately: call or text 988 (the Suicide & Crisis Lifeline) or text HOME to \
741741 (Crisis Text Line) — both are free, confidential, and available 24/7. If \
you feel unsafe right now, please go to your nearest emergency room. Talking to a \
psychologist or psychiatrist can make a real difference here; you are not alone. \
I'm here to support your health and fitness routine, but getting the right \
support from a professional on this matters far more.
""".strip()

CRISIS_RESPONSE = CRISIS_RESPONSE_TR  # geriye dönük uyumluluk (varsayılan TR)

_CRISIS_RESPONSES = {"tr": CRISIS_RESPONSE_TR, "en": CRISIS_RESPONSE_EN}


def get_crisis_response(language: str) -> str:
    """language için kriz metnini döndürür, bilinmeyen/None değerlerde TR'ye düşer."""
    return _CRISIS_RESPONSES.get(language, CRISIS_RESPONSE_TR)

MOOD_SUPPORT_GUIDANCE = """
Kullanıcının şu anki duygusunu önce olduğu gibi kabul et, geçersiz kılma ("bu kadar \
da abartma" gibi ifadelerden kaçın). Hedeften sapmayı (antrenman atlama, plan dışı \
yeme vb.) başarısızlık değil, sürecin doğal bir parçası olarak çerçevele. Aşırı \
iyimser/yapay pozitiflikten kaçın; önce duyguyu kabul et, sonra nazikçe ileri \
bakışlı bir çerçeve sun. Terapi yapma, psikolojik teşhis koyma ("sende anksiyete \
var" gibi ifadeler kullanma), ilaç veya tedavi tavsiyesi verme, kullanıcının neden \
böyle hissettiğine dair kendi yorumunu dayatma — sadece söylediklerini yansıtıp \
destek ver. Kullanıcı somut bir fiziksel belirti belirtiyorsa (örn. istemsiz kilo \
kaybı/artışı, sürekli ağrı, iştah kaybı, uyku bozukluğu), bu duygusal destekten \
ayrı bir konudur: teşhis koymadan, bunun bir sağlık profesyoneline danışılması \
gereken bir durum olabileceğini duygusal desteğin yanına nazikçe ekle — bu \
uyarıyı atlama. Sıcak, sakin, yargılamayan ve kısa (4-6 cümle) bir dille yanıt ver.
""".strip()

MOOD_LOG_REMINDER = (
    "\n\nKullanıcı BUGÜN nasıl hissettiğini açıkça söylediyse (stresli, kötü, harika vb.) ve bu turda "
    "log_mood'u henüz çağırmadıysan şimdi çağır: kaydetmez, sana kullanıcıya soracağın onay sorusunu verir."
)

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
        # 2026-08-12 canlı testte bulundu: "ölmeliyim" (zorunluluk kipi)
        # yukarıdaki "istiyorum/düşünüyorum" kalıbına uymuyordu, kaçırılıyordu.
        # "olmaliyim" (olmak/become, zararsız) ile KARIŞMAZ — "ölmek" (ö->o)
        # farklı bir kökten geliyor, normalize sonrası "olmeliyim" kalıyor.
        r"olmeliyim\b",
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

# Faz 3 canlı testinde bulundu (2026-08-09): preferred_language="en" olan bir
# kullanıcı kriz mesajını İNGİLİZCE yazarsa yukarıdaki (sadece Türkçe) kalıplar
# hiç tetiklenmiyor, mesaj deterministik katmanı atlayıp doğrudan LLM'e
# gidiyordu — bu, check_crisis_indicators'ın kendi tasarım ilkesini
# ("tespit LLM'in muhakemesine bırakılmaz") ihlal ediyordu. Aynı yüksek-recall/
# düşük-precision felsefesiyle İngilizce eşdeğerleri eklendi. _normalize zaten
# noktalama/kesme işaretini boşluğa indirgiyor (ör. "don't" -> "don t"), bu
# yüzden kesmeli kalıplar "don t" / "can t" / "haven t" şeklinde yazıldı.
_CRISIS_PHRASES_EN = (
    "suicide",
    "suicidal",
)

_CRISIS_REGEXES_EN = tuple(
    re.compile(pattern)
    for pattern in (
        # Kendine zarar verme / intihar düşüncesi
        _flex("hurt", "myself"),
        _flex("harm", "myself"),
        _flex("kill", "myself"),
        # "cut myself some slack" (kendine hoşgörü göster) yaygın, MASUM bir
        # İngilizce deyim - bunu yanlışlıkla tetiklememek için hariç tutuldu.
        r"cut\s+myself\b(?!\s+some\s+slack)",
        _flex("end", "my life"),
        r"want(?:s|ed)?\s+to\s+die\b",
        # 2026-08-12 canlı testte bulundu: "I must die" gibi zorunluluk kipi
        # ifadeleri yukarıdaki "want to die" kalıbına uymuyordu, deterministik
        # katmanı atlayıp LLM'e gidiyordu (LLM kendi başına doğrulanmamış
        # varsayımlarla yanıt üretiyordu). Modal fiil grubu eklendi.
        r"\b(?:must|have\s+to|need\s+to|gonna|going\s+to)\s+die\b",
        _flex("thinking", "about dying"),
        r"don\s+t\s+want\s+to\s+live\b",
        r"do\s+not\s+want\s+to\s+live\b",
        r"don\s+t\s+want\s+to\s+wake\s+up\b",
        r"do\s+not\s+want\s+to\s+wake\s+up\b",
        r"better\s+off\s+dead\b",
        r"no\s+point\s+(?:in\s+)?living\b",
        r"life\s+(?:has\s+|is\s+)?no\s+meaning\b",
        r"nothing\s+matters\s+anymore\b",
        r"can\s+t\s+take\s+it\s+anymore\b",
        r"cannot\s+take\s+it\s+anymore\b",
        r"can\s+t\s+go\s+on\s+anymore\b",
        # Uzun süreli çökkünlük
        r"don\s+t\s+enjoy\s+anything\s+anymore\b",
        _flex("nothing", "brings me joy"),
        r"feel(?:ing)?\s+worthless\b",
        r"constantly\s+feel(?:ing)?\s+worthless\b",
        r"tired\s+of\s+living\b",
        r"sick\s+of\s+living\b",
        r"can\s+t" + _GAP + r"out\s+of\s+bed\b",
        # Yeme bozukluğu belirtileri
        _flex("make", "myself throw up"),
        _flex("make", "myself vomit"),
        _flex("starve", "myself"),
        r"haven\s+t\s+eaten" + _GAP + r"days\b",
        _flex("afraid", "to eat"),
        _flex("scared", "to eat"),
        r"refuse\s+to\s+eat\b",
    )
)


def check_crisis_indicators(message: str) -> bool:
    """Ham kullanıcı mesajını deterministik anahtar kelime/regex kalıplarıyla
    tarar. Orchestrator LLM'i hiç çağrılmadan ÖNCE, ham mesaj üzerinde
    çalıştırılmalıdır — tespit LLM'in muhakemesine bırakılmaz. Hem Türkçe hem
    İngilizce kalıplar taranır (bkz. preferred_language="en" kullanıcıları
    için Faz 3 notu yukarıda) — kullanıcının arayüz dili ile mesajını yazdığı
    dil her zaman aynı olmak zorunda değil, bu yüzden dil parametresi ALINMAZ,
    her mesaj her iki dilde de taranır."""
    normalized = _normalize(message)
    if any(phrase in normalized for phrase in _CRISIS_PHRASES):
        return True
    if any(phrase in normalized for phrase in _CRISIS_PHRASES_EN):
        return True
    if any(pattern.search(normalized) for pattern in _CRISIS_REGEXES):
        return True
    return any(pattern.search(normalized) for pattern in _CRISIS_REGEXES_EN)


# Sohbetten ruh hali kaydı (2026-09-29). Günde tek kayıt (UPSERT) ve kullanıcının
# widget'ta kendi seçtiği değeri bir TAHMİNLE ezmemek için kayıt ancak onayla
# yapılır: araç ilk çağrıda kaydetmez, soracağı soruyu döndürür; kullanıcı bir
# sonraki mesajda onaylarsa (koçun önceki mesajı bu soruysa) kaydeder. Kullanıcı
# açıkça "ruh halimi ... kaydet" derse soru gerekmez. Kriz mesajları buraya hiç
# gelmez (check_crisis_indicators LLM'den önce çalışır).
_MOOD_KEY_ALIASES = {
    "zor": "zor", "hard": "zor", "berbat": "zor", "cok kotu": "zor",
    "dusuk": "dusuk", "low": "dusuk", "kotu": "dusuk",
    "notr": "notr", "neutral": "notr", "normal": "notr",
    "iyi": "iyi", "good": "iyi",
    "harika": "harika", "great": "harika", "cok iyi": "harika",
}
_MOOD_QUESTION = {
    "tr": ("Bugünkü ruh halini \"{label}\" olarak işaretleyeyim mi?", "Bugün ruh halin \"{current}\" işaretli; \"{label}\" olarak değiştireyim mi?"),
    "en": ("Shall I mark today's mood as \"{label}\"?", "Today's mood is marked \"{current}\"; shall I change it to \"{label}\"?"),
}
# Koçun önceki mesajı bir ruh hali onay sorusu muydu (kendi sorumuz ya da modelin
# kendi cümlesiyle sorduğu aynı soru).
_ASKED_RE = re.compile(r"ruh hal.{0,80}(isaretle|kaydet|degistir)\w* ?m[iı]\b|mark today s mood|change it to")
# Kullanıcı açıkça kaydetmesini istiyor ("ruh halimi düşük olarak kaydet").
_EXPLICIT_RE = re.compile(
    r"ruh hal\w*.{0,40}\b(kaydet|isaretle|gir|yaz|ekle)\w*|\b(kaydet|isaretle)\w*.{0,20}ruh hal"
    r"|\b(log|mark|set|save)\s+my\s+mood"
)
_DECLINE_RE = re.compile(r"^\s*(hayir|yok|gerek yok|istemiyorum|kalsin|isaretleme|kaydetme|no|nope|don t)\b")
_FUTURE_RE = re.compile(r"\b(yarin|tomorrow)\b")
# Kısa ve net onay ("evet", "evet işaretle", "olur"). 2026-09-29 eval: "Evet, işaretle"
# cevabında model 5 denemenin 1'inde log_mood'u hiç çağırmadı (yeniden denemede de).
_AFFIRM_RE = re.compile(r"^(evet|olur|tamam|tabii|tabi|isaretle|kaydet|lutfen|yes|sure|ok|okay|yep)\b")
_MAX_AFFIRM_WORDS = 5
# Sorudaki ruh hali etiketi (tırnak içinde; değiştirme sorusunda hedef SONDA).
_QUOTED_LABEL_RE = re.compile("[\"'“”‘’](Zor|Düşük|Nötr|İyi|Harika|Hard|Low|Neutral|Good|Great)[\"'“”‘’]")


def normalize_mood_key(value: str | None) -> str | None:
    if not value:
        return None
    return _MOOD_KEY_ALIASES.get(_normalize(value))


@dataclass
class MoodTurnState:
    """question: bu turda onay beklenen ruh hali sorusu (orkestratör yanıtta soru
    yoksa ekler). confirm: kullanıcı önceki turdaki soruya kısa bir onay verdiyse,
    model log_mood'u çağırmasa bile kaydı yapıp teyit cümlesini döndüren geri çağırma."""

    question: str | None = None
    logged: bool = False
    confirm: Callable[[], str] | None = None


def _affirmed_mood_key(previous_reply: str, message: str) -> str | None:
    """Önceki koç mesajı bir ruh hali onay sorusuysa ve bu mesaj kısa bir onaysa sorudaki değer."""
    if _ASKED_RE.search(_normalize(previous_reply)) is None:
        return None
    if len(message.split()) > _MAX_AFFIRM_WORDS or not _AFFIRM_RE.search(message) or _DECLINE_RE.search(message):
        return None
    labels = _QUOTED_LABEL_RE.findall(previous_reply)
    return normalize_mood_key(labels[-1]) if labels else None


def build_mood_support_tools(
    db: Session | None = None,
    user_id: int | None = None,
    user_message: str = "",
    previous_reply: str = "",
    language: str = "tr",
    state: MoodTurnState | None = None,
) -> list[BaseTool]:
    @tool
    def generate_supportive_response() -> str:
        """Kullanıcı kötü bir gün geçirdiğini, motivasyonunu kaybettiğini, üzgün ya da \
        yorgun hissettiğini veya hedeflerinden saptığını (örn. antrenmanı atladım, \
        plan dışı bir şey yedim) belirttiğinde bu aracı çağır. Bu araç sana nasıl \
        yanıt vermen gerektiğine dair kurallar döndürür; kullanıcının söylediklerini \
        bu kurallara göre, kendi cümlelerinle, sıcak ve yargılamayan bir dille \
        yanıtla."""
        # 2026-09-29 eval: "bugün çok stresli bir gün geçirdim" - model 5 denemenin 1'inde
        # yalnız bu aracı çağırıp log_mood'u atladı; araç çıktısındaki hatırlatma istemden etkili.
        if db is not None and not (state is not None and (state.question or state.logged)):
            return MOOD_SUPPORT_GUIDANCE + MOOD_LOG_REMINDER
        return MOOD_SUPPORT_GUIDANCE

    if db is None or user_id is None:
        return [generate_supportive_response]

    labels = mood_service.MOOD_LABELS_EN if language == "en" else mood_service.MOOD_LABELS
    message = _normalize(user_message)

    @tool
    def log_mood(mood: str | None = None) -> str:
        """Kullanıcının BUGÜNKÜ ruh halini (Profil > Ruh Hali kaydı) işaretler. mood şunlardan
        biri: zor, dusuk, notr, iyi, harika. Kullanıcı BUGÜN nasıl hissettiğini açıkça
        söylediğinde çağır (örn. 'bugün çok stresliyim' -> dusuk, 'berbat bir gün geçirdim'
        -> zor, 'bugün harika hissediyorum' -> harika). Kayıt kullanıcı onaylamadan
        yapılmaz: araç önce sana kullanıcıya soracağın soruyu döndürür; kullanıcı bir sonraki
        mesajda onaylarsa (örn. 'evet') aynı değerle tekrar çağır. Yarın/gelecek için
        ('yarın stresli olacağım') ya da genel bir sohbet için çağırma."""
        key = normalize_mood_key(mood)
        if key is None:
            return "Kaydedilmedi: ruh hali zor, dusuk, notr, iyi veya harika olmalı."
        if _FUTURE_RE.search(message):
            return "Kaydedilmedi: ruh hali yalnız bugün için işaretlenir; gelecek bir gün için kayıt yok, soru da sorma."
        explicit = _EXPLICIT_RE.search(message) is not None
        confirmed = _ASKED_RE.search(_normalize(previous_reply)) is not None and not _DECLINE_RE.search(message)
        if not (explicit or confirmed):
            current = mood_service.get_mood(db, user_id)
            if current is not None and current.mood_key == key:
                return f"Kaydedilmedi: bugünkü ruh hali zaten \"{labels[key]}\" işaretli, bir şey yapmana gerek yok."
            ask, change = _MOOD_QUESTION["en" if language == "en" else "tr"]
            question = (
                change.format(current=labels[current.mood_key], label=labels[key])
                if current is not None
                else ask.format(label=labels[key])
            )
            if state is not None:
                state.question = question
            return (
                "Kaydedilmedi (onay bekliyor): ruh hali kullanıcı onaylamadan işaretlenmez. "
                f"İşaretledim DEME; yanıtının sonunda kullanıcıya tam olarak şunu sor: {question}"
            )
        mood_service.log_mood(db, user_id, key)
        if state is not None:
            state.question = None
            state.logged = True
        return f"Kaydedildi: bugünkü ruh hali \"{labels[key]}\" olarak işaretlendi (Profil > Ruh Hali'nde görünür)."

    affirmed_key = _affirmed_mood_key(previous_reply, message)
    if state is not None and affirmed_key is not None:
        def confirm() -> str:
            assert db is not None and user_id is not None and affirmed_key is not None
            mood_service.log_mood(db, user_id, affirmed_key)
            state.logged = True
            template = "Today's mood is marked \"{label}\"." if language == "en" else "Bugünkü ruh halin \"{label}\" olarak işaretlendi."
            return template.format(label=labels[affirmed_key])

        state.confirm = confirm

    return [generate_supportive_response, log_mood]
