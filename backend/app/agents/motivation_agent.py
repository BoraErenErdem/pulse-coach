from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.llm import get_llm
from app.agents.prompts import SAFETY_RULES, tone_directive
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

# "Koç Tonu" ton direktifleri artık prompts.py::tone_directive'te PAYLAŞIMLI
# (2026-08-13'te orchestrator'ın da interaktif sohbette aynı tonu kullanması
# için taşındı - bkz. prompts.py'deki TONE_DIRECTIVES yorumu).


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
    system_prompt = _CHECKIN_BASE_PROMPT + "\n\n" + tone_directive(tone) + "\n\n" + language_directive
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
        _DAILY_NUDGE_BASE_PROMPT + "\n\n" + tone_directive(tone) + "\n\n" + language_directive
    )
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=signals_text)])
    return response.content


# --- Egzersiz Geçmişi Yorumu (2026-08-13 kullanıcı isteği) ---
# "Egzersizlerim" ekranındaki haftalık/aylık kıyaslamayı (workout_service.
# get_exercise_history) tek, kısa, TON'A duyarlı bir gözlem cümlesine
# çevirir. En kritik kural: ağırlık/tekrar trade-off'unu ASLA "iyi/kötü"
# olarak yargılama - ağırlık artıp tekrar düşmüşse GÜÇ kazanımı, ağırlık
# aynı/düşükken tekrar artmışsa DAYANIKLILIK kazanımı olarak çerçevele,
# ikisi de düşmüşse SUÇLAMADAN nötr bir gözlem yap.
_EXERCISE_PROGRESS_BASE_PROMPT = f"""
Sen "Sağlıklı Yaşam Koçu" adlı sağlık/fitness koçluk asistanısın. Sana kullanıcının TEK bir
egzersizdeki iki dönemin (önceki dönem vs en son dönem) en iyi seti (ağırlık × tekrar) ve
toplam set/tekrar sayıları verilecek. Bunu, kullanıcıya doğrudan gösterilecek TEK, kısa
(1-2 cümle) bir gözlem/yorum cümlesine dönüştür.

{SAFETY_RULES}

ÇOK ÖNEMLİ - yorumlama kuralları (bu ikisi arasında ASLA "iyi/kötü" hiyerarşisi kurma, ikisi
de eşit değerde gerçek bir ilerleme):
- Ağırlık artmış AMA tekrar sayısı aynı kalmış/azalmışsa: bunu GÜÇ (maksimal kuvvet) kazanımı
  olarak çerçevele - olumlu ve net.
- Ağırlık aynı kalmış/azalmışsa AMA tekrar sayısı artmışsa: bunu KAS DAYANIKLILIĞI kazanımı
  olarak çerçevele - olumlu ve net. ASLA "ağırlığı düşürdün" gibi olumsuz bir ifade kullanma.
- Hem ağırlık hem tekrar artmışsa: açık ve güçlü bir kutlama.
- Hem ağırlık hem tekrar aynı kalmış/azalmışsa: SUÇLAMADAN, yargılamadan nötr bir gözlem yap
  (ör. "bu dönem biraz daha hafif geçmiş görünüyor, dinlenme de programın bir parçası") - ASLA
  "gerilemişsin"/"kötüye gitmiş" gibi olumsuz bir yargı kurma, asla suçlayıcı olma.
""".strip()


def render_exercise_progress_insight(
    db: Session,
    user_id: int,
    exercise_name: str,
    previous,
    latest,
) -> str:
    """`previous`/`latest`, workout_service.ExercisePeriodStat nesneleridir
    (döngüsel import'tan kaçınmak için burada tip anotasyonu YOK - saf
    veri taşıyıcılar, sadece alanları okunuyor)."""
    language = profile_service.get_language(db, user_id)
    tone = profile_service.get_coach_tone(db, user_id)

    def _set_text(weight_kg, reps):
        if weight_kg is None:
            return f"{reps} tekrar" if language != "en" else f"{reps} reps"
        if language == "en":
            return f"{weight_kg} kg × {reps} reps"
        return f"{weight_kg} kg × {reps} tekrar"

    if language == "en":
        human_text = (
            f"Exercise: {exercise_name}\n"
            f"Previous period ({previous.period_start} - {previous.period_end}): "
            f"best set {_set_text(previous.top_weight_kg, previous.top_weight_reps)}, "
            f"total {previous.total_sets} sets / {previous.total_reps} reps\n"
            f"Latest period ({latest.period_start} - {latest.period_end}): "
            f"best set {_set_text(latest.top_weight_kg, latest.top_weight_reps)}, "
            f"total {latest.total_sets} sets / {latest.total_reps} reps"
        )
    else:
        human_text = (
            f"Egzersiz: {exercise_name}\n"
            f"Önceki dönem ({previous.period_start} - {previous.period_end}): "
            f"en iyi set {_set_text(previous.top_weight_kg, previous.top_weight_reps)}, "
            f"toplam {previous.total_sets} set / {previous.total_reps} tekrar\n"
            f"Son dönem ({latest.period_start} - {latest.period_end}): "
            f"en iyi set {_set_text(latest.top_weight_kg, latest.top_weight_reps)}, "
            f"toplam {latest.total_sets} set / {latest.total_reps} tekrar"
        )

    language_directive = _CHECKIN_LANGUAGE_DIRECTIVE_EN if language == "en" else _CHECKIN_LANGUAGE_DIRECTIVE_TR
    system_prompt = _EXERCISE_PROGRESS_BASE_PROMPT + "\n\n" + tone_directive(tone) + "\n\n" + language_directive
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=human_text)])
    return response.content


# --- Ruh Hali İçgörüsü (2026-08-16, kullanıcı isteği) ---
# trend_service.compute_mood_insight_stats()'ın hesapladığı 1-2 kural-tabanlı
# istatistiksel sinyali (haftalık eğilim ve/veya haftanın-günü örüntüsü) TEK
# bir gözlem cümlesine çevirir - render_exercise_progress_insight ile AYNI
# iskelet. En kritik fark: bu bir "kıyaslama" değil, kullanıcının kendi ruh
# hali GEÇMİŞİ üzerine bir gözlem - kullanıcı bunu "beni yargılıyor" gibi
# hissetmemeli, bu yüzden aşağıdaki kurallar exercise-insight'takinden daha
# sıkı (nedensellik/tavsiye/klinik dil YASAKLARI ayrıca eklendi).
_MOOD_INSIGHT_BASE_PROMPT = f"""
Sen "Sağlıklı Yaşam Koçu" adlı sağlık/fitness koçluk asistanısın. Sana kullanıcının ruh hali
geçmişinden çıkarılmış, kural tabanlı 1-2 istatistiksel gözlem verilecek (haftalık ortalama
eğilimi ve/veya haftanın belirli bir günündeki örüntü). Bunu, kullanıcıya doğrudan gösterilecek
TEK, kısa (1 cümle, en fazla 2) bir gözlem cümlesine dönüştür.

{SAFETY_RULES}

ÇOK ÖNEMLİ - kesin kurallar:
- ASLA nedensellik iddia etme ("çünkü Pazartesi kötü hissediyorsun" YASAK) - SADECE gözlemsel
  bir örüntüden bahset ("Pazartesi ortalaman diğer günlere göre daha düşük seyrediyor" gibi).
- ASLA tavsiye, çözüm ya da somut bir eylem önerme - bu senin başka bir görevin, burada sadece
  nötr/sıcak bir gözlem yeterli.
- ASLA klinik ya da tanı koyucu bir dil kullanma ("depresyon", "anksiyete", "bozukluk" gibi
  kelimeler YASAK) - bu bir sağlıklı-yaşam gözlemi, bir tıbbi değerlendirme DEĞİL.
- Eğilim düşüşteyse: ASLA suçlayıcı ya da yargılayıcı olma ("kötüye gidiyorsun", "başarısızsın"
  gibi ifadeler YASAK) - sadece nazik, nötr bir gözlem yap; istersen çok hafif bir teşvikle
  kapatabilirsin ama baskı unsuru olarak DEĞİL.
- Eğilim yükselişteyse: daha sıcak ve kutlayıcı bir ton kullanabilirsin.
""".strip()

_MOOD_WEEKDAY_NAMES_TR: dict[str, str] = {
    "monday": "Pazartesi",
    "tuesday": "Salı",
    "wednesday": "Çarşamba",
    "thursday": "Perşembe",
    "friday": "Cuma",
    "saturday": "Cumartesi",
    "sunday": "Pazar",
}
_MOOD_WEEKDAY_NAMES_EN: dict[str, str] = {
    "monday": "Monday",
    "tuesday": "Tuesday",
    "wednesday": "Wednesday",
    "thursday": "Thursday",
    "friday": "Friday",
    "saturday": "Saturday",
    "sunday": "Sunday",
}


def render_mood_insight(db: Session, user_id: int, stats) -> str:
    """`stats`, trend_service.MoodInsightStats'tır (döngüsel import'tan
    kaçınmak için burada tip anotasyonu YOK - render_exercise_progress_insight
    ile aynı gerekçe, saf veri taşıyıcı, sadece alanları okunuyor)."""
    language = profile_service.get_language(db, user_id)
    tone = profile_service.get_coach_tone(db, user_id)
    weekday_names = _MOOD_WEEKDAY_NAMES_EN if language == "en" else _MOOD_WEEKDAY_NAMES_TR

    lines: list[str] = []
    if stats.trend_direction is not None:
        if language == "en":
            lines.append(
                f"Average mood score over the most recent weeks: {stats.recent_avg:.1f}/5, "
                f"compared to {stats.previous_avg:.1f}/5 in the weeks before that "
                f"(direction: {stats.trend_direction})."
            )
        else:
            lines.append(
                f"Son haftalardaki ortalama ruh hali puanı: {stats.recent_avg:.1f}/5, "
                f"öncesindeki haftalarda {stats.previous_avg:.1f}/5 idi (yön: {stats.trend_direction})."
            )
    if stats.weekday_key is not None:
        day_name = weekday_names[stats.weekday_key]
        if language == "en":
            lines.append(
                f"{day_name} average mood score is {stats.weekday_avg:.1f}/5, "
                f"versus an overall average of {stats.overall_avg:.1f}/5."
            )
        else:
            lines.append(
                f"{day_name} günlerindeki ortalama ruh hali puanı {stats.weekday_avg:.1f}/5, "
                f"genel ortalama ise {stats.overall_avg:.1f}/5."
            )
    human_text = "\n".join(lines)

    language_directive = _CHECKIN_LANGUAGE_DIRECTIVE_EN if language == "en" else _CHECKIN_LANGUAGE_DIRECTIVE_TR
    system_prompt = _MOOD_INSIGHT_BASE_PROMPT + "\n\n" + tone_directive(tone) + "\n\n" + language_directive
    llm = get_llm()
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=human_text)])
    return response.content
