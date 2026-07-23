import logging
from langchain_core.tools import BaseTool, tool

logger = logging.getLogger(__name__)

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

# Kasıtlı olarak yüksek recall / düşük precision: yanlış alarm kabul edilebilir, kaçırma kabul edilemez. Bu yüzden basit alt-dize eşleşmesi yeterli, ayrıca normalize edilmiş (küçük harf + Türkçe karakter -> ASCII) metin üzerinde çalışır ki kullanıcı Türkçe karakter kullanmasa da (ör. "olmek istiyorum") yakalansın.
_CRISIS_PHRASES = (
    # Kendine zarar verme / intihar düşüncesi
    "kendime zarar",
    "kendimi oldur",
    "kendimi kesiyorum",
    "bilegimi kestim",
    "intihar",
    "canima kiy",
    "yasamak istemiyorum",
    "olmek istiyorum",
    "olmeyi dusunuyorum",
    "hayatima son ver",
    "bir daha uyanmak istemiyorum",
    "olsem daha iyi",
    "yasamanin bir anlami yok",
    "yasamanin anlami yok",
    "artik dayanamiyorum",
    # Uzun süreli çökkünlük
    "hicbir seyden zevk almiyorum",
    "aylardir kendimi kotu hissediyorum",
    "haftalardir depresyonda",
    "surekli degersiz hissediyorum",
    "kendimi degersiz hissediyorum",
    "yasamaktan yoruldum",
    # Yeme bozukluğu belirtileri
    "kendimi kusturuyorum",
    "kendimi ac birakiyorum",
    "gunlerdir hicbir sey yemedim",
    "gunlerdir bir sey yemedim",
    "yemek yemeyi reddediyorum",
)


def check_crisis_indicators(message: str) -> bool:
    """Ham kullanıcı mesajını deterministik anahtar kelime kalıplarıyla tarar.
    Orchestrator LLM'i hiç çağrılmadan ÖNCE, ham mesaj üzerinde çalıştırılmalıdır —
    tespit LLM'in muhakemesine bırakılmaz."""
    normalized = message.lower().translate(_TR_TRANSLATION)
    return any(phrase in normalized for phrase in _CRISIS_PHRASES)


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
