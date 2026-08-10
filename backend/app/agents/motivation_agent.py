from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.llm import get_llm
from app.agents.prompts import SAFETY_RULES
from app.services import profile_service, progress_service

# render_checkin_message() ORCHESTRATOR LLM'inin ARKASINDAN çalışmıyor (bkz.
# scheduler/jobs.py - APScheduler doğrudan çağırıyor, interaktif sohbet
# döngüsü yok) - yani WeeklySummary.as_text()'teki "agent tool çağrıları
# language hiç vermez, çünkü çıktısı Türkçe-konuşan orchestrator'a bağlam
# olarak gidiyor" gerekçesi BURADA GEÇERLİ DEĞİL. Bu fonksiyon kullanıcıya
# giden NİHAİ metni (hem checkin_messages tablosuna hem e-postaya) kendisi
# üretiyor - Faz 3 sadece interaktif sohbeti kapsamıştı, bu proaktif kanal
# (en görünür olanı - gerçek bir e-posta) atlanmıştı (2026-08-10 sekme
# mimarisi incelemesinde bulundu).
#
# İLK DENEME (tamamen ayrı TR/EN prompt'lar) canlı testte BAŞARISIZ oldu:
# SAFETY_RULES sabiti kendisi tamamen Türkçe olduğu için EN prompt'a f-string
# ile gömülünce modeli baskın şekilde Türkçe'ye çekiyordu, İngilizce
# kullanıcı için de Türkçe mesaj üretiliyordu. Çözüm: prompts.py::
# build_orchestrator_system_prompt'taki KANITLANMIŞ desen - base prompt
# (SAFETY_RULES dahil) Türkçe KALIR, en SONA güçlü/kısa bir dil direktifi
# eklenir (son okunan metin en güçlü sinyal).
_CHECKIN_BASE_PROMPT = f"""
Sen "Sağlıklı Yaşam Koçu" adlı sağlık/fitness koçluk asistanısın. Sana kullanıcının son 7
günlük ilerleme özeti (ham veri) verilecek. Bunu, kullanıcıya doğrudan proaktif bir
check-in mesajı olarak gönderilecek şekilde 2-3 cümlelik, sıcak ve destekleyici bir
mesaja dönüştür.

{SAFETY_RULES}
""".strip()

_CHECKIN_LANGUAGE_DIRECTIVE_TR = "Yanıtını Türkçe ver."
_CHECKIN_LANGUAGE_DIRECTIVE_EN = (
    "Kullanıcının tercih ettiği arayüz dili İngilizce. Yanıtını HER ZAMAN İngilizce ver, "
    "Türkçe tek kelime bile kullanma."
)


def build_motivation_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def generate_encouragement() -> str:
        """Kullanıcının son 7 günlük ilerleme verisini (ham veri) getirir. Bu veriyi
        kullanıcıya olduğu gibi gösterme; motivasyon kurallarına uygun, sıcak,
        destekleyici ve asla suçlayıcı/utandırıcı olmayan bir dille yeniden ifade ederek
        yanıtla. Kullanıcı motivasyon, teşvik ya da 'nasıl gidiyorum' türünden bir şey
        istediğinde bu aracı çağır."""
        return progress_service.generate_weekly_summary(db, user_id).as_text()

    @tool
    def generate_checkin_message() -> str:
        """Proaktif bir check-in mesajı için kullanıcının son 7 günlük ilerleme özetini
        (ham veri) getirir. Bu veriyi kullanıcıya olduğu gibi gösterme; motivasyon
        kurallarına uygun, sıcak ve kısa bir check-in mesajına dönüştürerek yanıtla."""
        return progress_service.generate_weekly_summary(db, user_id).as_text()

    return [generate_encouragement, generate_checkin_message]


def render_checkin_message(db: Session, user_id: int) -> str:
    """Proaktif check-in job'ları (APScheduler) tarafından çağrılır: interaktif bir
    sohbet döngüsü olmadığı için haftalık özeti tek seferlik bir LLM çağrısıyla sıcak
    bir check-in mesajına çevirir. Kullanıcının preferred_language'ına göre hem özet
    metni hem sistem promptu seçilir - bu fonksiyonun ürettiği metin doğrudan
    kullanıcıya gidiyor (DB + e-posta), araya bir çeviri katmanı girmiyor."""
    language = profile_service.get_language(db, user_id)
    summary_text = progress_service.generate_weekly_summary(db, user_id).as_text(language)
    directive = _CHECKIN_LANGUAGE_DIRECTIVE_EN if language == "en" else _CHECKIN_LANGUAGE_DIRECTIVE_TR
    system_prompt = _CHECKIN_BASE_PROMPT + "\n\n" + directive
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=summary_text)])
    return response.content
