from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.llm import get_llm
from app.agents.prompts import SAFETY_RULES
from app.services import profile_service, progress_service
from app.services.daily_nudge_service import DailyNudgeSignals

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

# "Koç Tonu" (2026-08-12 kullanıcı kararı) - profildeki AÇIK bir tercih,
# otomatik tahmin DEĞİL (bkz. models/user_profile.py::coach_tone). Dil
# direktifiyle AYNI ilke: base prompt Türkçe kalır, direktif SONA eklenir
# (kanıtlanmış desen - dil direktifi de en son okunduğu için baskın çıkıyor).
# Tanınmayan/None tone -> "notr" (get_coach_tone zaten bu varsayılana düşer).
_CHECKIN_TONE_DIRECTIVES: dict[str, str] = {
    "sicak": "Ton: Sıcak ve nazik ol - şefkatli, yumuşak, teselli edici bir dil kullan.",
    "enerjik": "Ton: Enerjik ve coşkulu ol - harekete geçirici, canlı bir dil kullan (abartıya kaçmadan).",
    "notr": "Ton: Sakin ve dengeli ol - ne aşırı coşkulu ne soğuk, ölçülü bir dil kullan.",
}


def _tone_directive(tone: str) -> str:
    return _CHECKIN_TONE_DIRECTIVES.get(tone, _CHECKIN_TONE_DIRECTIVES["notr"])


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
    tone = profile_service.get_coach_tone(db, user_id)
    summary_text = progress_service.generate_weekly_summary(db, user_id).as_text(language)
    language_directive = _CHECKIN_LANGUAGE_DIRECTIVE_EN if language == "en" else _CHECKIN_LANGUAGE_DIRECTIVE_TR
    # Dil direktifi EN SONA - kanıtlanmış desen, aksi halde Türkçe base
    # prompt ağır basıp EN kullanıcıya da Türkçe yanıt üretilebiliyor.
    system_prompt = _CHECKIN_BASE_PROMPT + "\n\n" + _tone_directive(tone) + "\n\n" + language_directive
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=summary_text)])
    return response.content


# Günlük koşullu hatırlatma (2026-08-12 kararı): koşulsuz "her gün push"
# yerine, 3 sinyalden (mod girilmemiş/öğün girilmemiş/seri risk altında) en
# az biri doğruysa TEK bir birleşik, doğal cümleye dönüştürülüyor - şablon
# DEĞİL, LLM (bu iş asenkron bir job'da, kullanıcı beklemiyor, PR/hedef
# anlık bildirimlerinin aksine burada LLM kullanmamak için bir gerekçe yok).
_DAILY_NUDGE_BASE_PROMPT = f"""
Sen "Sağlıklı Yaşam Koçu" adlı sağlık/fitness koçluk asistanısın. Kullanıcı bugün henüz
şu üç şeyden birini/birkaçını yapmamış (aşağıda hangileri geçerliyse listelenecek). Bunları
kullanıcıya doğrudan gönderilecek TEK, kısa (1-2 cümle), sıcak ve nazik bir hatırlatma
mesajına dönüştür - listedeki her maddeyi ayrı ayrı sayma, doğal tek bir cümlede birleştir.

{SAFETY_RULES}

ÖZELLİKLE ÖNEMLİ: "bugün antrenman yapmadın" gibi bir ifadeyi ASLA tek başına, suçlayıcı bir
şekilde kurma - seri riski varsa bunu nazik bir teşvik olarak çerçevele, baskı unsuru olarak değil.
""".strip()

_DAILY_NUDGE_SIGNAL_TEXT_TR = {
    "mood_not_logged": "Kullanıcı bugün ruh halini henüz kaydetmedi.",
    "meal_not_logged": "Kullanıcının beslenme hedefi var ama bugün henüz hiç öğün kaydetmedi.",
    "streak_at_risk": "Kullanıcının haftalık antrenman serisi var ama bu hafta henüz hiç antrenman kaydı yok, hafta sonu yaklaşıyor - seri risk altında.",
}
_DAILY_NUDGE_SIGNAL_TEXT_EN = {
    "mood_not_logged": "The user hasn't logged their mood today yet.",
    "meal_not_logged": "The user has a nutrition goal but hasn't logged any meal today yet.",
    "streak_at_risk": "The user has an active weekly workout streak but hasn't logged any workout this week yet, and the week is ending soon - the streak is at risk.",
}


def render_daily_nudge_message(db: Session, user_id: int, signals: DailyNudgeSignals) -> str:
    """`daily_nudge_service.collect_signals()`'ın önceden hesapladığı
    sinyalleri (tekrar sorgu YAPILMADAN) tek doğal cümleye çeviren, saf bir
    LLM-formatlama fonksiyonu - `render_checkin_message` ile aynı şekilde
    APScheduler tarafından çağrılır."""
    language = profile_service.get_language(db, user_id)
    tone = profile_service.get_coach_tone(db, user_id)
    texts = _DAILY_NUDGE_SIGNAL_TEXT_EN if language == "en" else _DAILY_NUDGE_SIGNAL_TEXT_TR

    active_lines = []
    if signals.mood_not_logged:
        active_lines.append(texts["mood_not_logged"])
    if signals.meal_not_logged:
        active_lines.append(texts["meal_not_logged"])
    if signals.streak_at_risk:
        active_lines.append(texts["streak_at_risk"])
    signals_text = "\n".join(active_lines)

    language_directive = _CHECKIN_LANGUAGE_DIRECTIVE_EN if language == "en" else _CHECKIN_LANGUAGE_DIRECTIVE_TR
    system_prompt = (
        _DAILY_NUDGE_BASE_PROMPT + "\n\n" + _tone_directive(tone) + "\n\n" + language_directive
    )
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=signals_text)])
    return response.content
