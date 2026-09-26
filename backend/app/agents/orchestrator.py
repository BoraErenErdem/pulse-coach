import logging
import queue
import re
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from uuid import UUID
from langchain.agents import create_agent
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from sqlalchemy.orm import Session
from app.agents.exercise_agent import build_exercise_tools
from app.agents.llm import get_llm
from app.agents.mood_support_agent import (
    build_mood_support_tools,
    check_crisis_indicators,
    get_crisis_response,
)
from app.agents.motivation_agent import build_motivation_tools
from app.agents.nutrition_agent import build_nutrition_tools
from app.agents.nutrition_tracking_agent import build_nutrition_tracking_tools
from app.agents.profile_agent import build_profile_tools
from app.agents.prompts import build_orchestrator_system_prompt
from app.agents.tracking_agent import build_tracking_tools
from app.agents.workout_tracking_agent import build_workout_tracking_tools
from app.models.conversation import Conversation
from app.services import conversation_service, mood_service, profile_service
from app.services.fuzzy_match import tr_lower

logger = logging.getLogger(__name__)

_SENTENCE_END_RE = re.compile(r"[.!?…](?=\s|$)")
# Markdown sıralı liste maddesi öneki ("1.", "2." vb., satır başında/içerik
# başında) - bu bir cümle SONU değil, madde numarası. _SENTENCE_END_RE bunu
# da (rakam+nokta+boşluk) eşleştirdiği için sayılı bir liste içeren yanıtlar
# yapay olarak şişirilmiş cümle sayısıyla listenin ORTASINDA (ör. "2."den
# hemen sonra, madde içeriği hiç yazılmadan) kesiliyordu - kullanıcı canlı
# sohbette yakaladı (2026-08-13). "Cümle 1." gibi bir cümlenin SONUNDA duran
# rakamlar (satır başında değil) bundan ETKİLENMEZ, hâlâ normal cümle sonu
# sayılır.
_LIST_MARKER_RE = re.compile(r"(?:^|\n)[ \t]*\d{1,2}\.(?=\s|$)")
# Markdown BAŞLIK satırı ("#", "##", "### 🥩 I. Protein İhtiyacı: ..." gibi).
# Yukarıdaki _LIST_MARKER_RE SADECE Arap rakamlı liste maddelerini ("1.",
# "2.") kapsıyordu - model başlıklarda Romen rakamı ("### I.", "### II.")
# kullandığında bu YAKALANMIYORDU, "I."deki nokta normal cümle sonu sanılıp
# yanıt tam o noktada (başlığın ortasında, "### 🥩 I." ile) kesiliyordu -
# kullanıcı canlı sohbette yakaladı (2026-08-14, uzun/detaylı cevap testi).
# Kök neden aynıydı ama kapsamı dardı: Romen rakamı, harf listesi (a., b.)
# gibi her türlü başlık biçimini tek tek eklemek yerine, BAŞLIK SATIRININ
# TAMAMINI (içindeki noktalama ne olursa olsun) cümle sonu taramasından
# hariç tutmak genel çözüm - bir başlık zaten hiçbir zaman "cümle" değildir.
_HEADING_LINE_RE = re.compile(r"^[ \t]*#{1,6}[ \t]")
# Kullanıcı özellikle detaylı/uzun/kapsamlı bir yanıt istediğinde
# MAX_REPLY_SENTENCES'ın kör 6 cümle sınırı LLM'in ürettiği kaliteli, uzun
# içeriği (ör. 4600+ karakterlik düzgün yapılandırılmış bir rehber) neredeyse
# tamamen çöpe atıyordu - SAFETY_RULES zaten "kullanıcı detay istemedikçe
# uzun açıklama yapma" diyor, yani post-processing bu istisnaya hiç
# saygı göstermiyordu (2026-08-14, kullanıcı canlı sohbette "en uzun cevabı
# ne kadar düzgün verebiliyor" diye test ederken yakalandı).
_DETAIL_REQUEST_RE = re.compile(
    r"detayl[ıi]|kapsaml[ıi]|ayr[ıi]nt[ıi]l[ıi]|uzun\b|"
    r"\bdetail(?:ed)?\b|\bcomprehensive\b|\bin[- ]depth\b|\blong\b",
    re.IGNORECASE,
)
# Kullanıcı açıkça KISA/özet bir yanıt istediğinde (ör. "kısaca söyle",
# "özetle") - eskiden bu da varsayılan MAX_REPLY_SENTENCES tavanını
# paylaşıyordu, ama o tavan "kahvaltıda ne yemeliyim?" gibi ne kısa ne
# detaylı istenen ORTA seviye bilgi sorularını da aynı sert sınıra
# sıkıştırıyordu (2026-08-14, kullanıcıyla tartışılıp 3 katmana ayrıldı:
# açık kısa isteği > açık detay isteği > hiçbiri belirtilmemiş = orta).
# Her iki kalıp da eşleşirse (çelişkili istek, ör. "kısaca ama detaylı")
# BRIEF önceliklidir - kullanıcının kullandığı literal kelimeye sadık kal.
_BRIEF_REQUEST_RE = re.compile(
    # "özet" ASCII-tolerans için [oö] - kullanıcılar Türkçe karaktersiz
    # yazabiliyor (uygulamada canlı olarak görülüyor), "kısa" tarafı zaten
    # [ıi] ile bunu kapsıyordu, "özet" de aynı tutarlılıkla kapsanmalı
    # (debug testinde "ozetler misin" yanlışlıkla eşleşmiyordu, 2026-08-14).
    r"\bk[ıi]sa\w*|\b[oö]zet\w*|tek c[üu]mle|birka[çc] kelimeyle|"
    r"\bbriefly\b|\bin short\b|\bshort answer\b|\bsummar(?:y|ize)\b|\bone sentence\b",
    re.IGNORECASE,
)


def _sentence_end_matches(content: str) -> list[re.Match[str]]:
    """`_SENTENCE_END_RE` eşleşmelerini döner, ama satır başındaki liste
    maddesi numaralarını ("1.", "2." vb.) ve markdown başlık satırlarının
    (Romen rakamlı "I."/"II." dahil) içindeki noktalamayı cümle sonu SAYMAZ."""
    list_marker_ends = {m.end() for m in _LIST_MARKER_RE.finditer(content)}
    matches = []
    for m in _SENTENCE_END_RE.finditer(content):
        if m.end() in list_marker_ends:
            continue
        line_start = content.rfind("\n", 0, m.start()) + 1
        line_end = content.find("\n", m.start())
        line = content[line_start : line_end if line_end != -1 else len(content)]
        if _HEADING_LINE_RE.match(line):
            continue
        matches.append(m)
    return matches

# SAFETY_RULES artık sabit bir cümle sayısı DEMİYOR (2026-08-14: "en fazla
# 4-6 cümle" ifadesi kaldırılıp "duruma göre ayarla" şeklinde adaptif hale
# getirildi - kullanıcıyla birlikte alınan bilinçli karar). Ama bu sadece
# prompt talimatı — gemma4:e4b prompt-only talimatlara güvenilir şekilde
# uymuyor (eval'de gözlendi), bu yüzden kod-seviyesinde ÜÇ katmanlı bir üst
# sınır var (modern LLM sohbet arayüzlerinin davranışıyla aynı ilke: kısa
# iste->kısa, hiçbir şey deme->orta, detaylı iste->uzun):
MAX_REPLY_SENTENCES_BRIEF = 4
# Kullanıcı ne kısa ne detay istemişse (ör. "kahvaltıda ne yemeliyim?") -
# eskiden bu da BRIEF ile aynı sert 6 cümle tavanını paylaşıyordu, bu yüzden
# modelin kendiliğinden ürettiği makul-uzunlukta bilgilendirici cevaplar
# (ör. 3000+ karakter) gereksiz yere aşırı kırpılıyordu (2026-08-14,
# kullanıcıyla tartışılıp ayrı bir "orta" katmana çıkarıldı).
MAX_REPLY_SENTENCES_MEDIUM = 12
# Kullanıcı açıkça detay/uzunluk istediğinde uygulanan gevşetilmiş sınır -
# "sınırsız" değil (aşırı uzun/pahalı bir yanıtı yine de makul bir üst sınırda
# tutmak için), ama pratikte LLM'in ürettiği tipik uzun rehberleri kırpmadan
# geçirmeye yetecek kadar geniş. İlk değer 40'tı; canlı testte "toparlanma"
# gibi çok kapsamlı isteklerde (6000+ karakter, ~45+ cümle) bile bazen hâlâ
# devreye girdiği görüldü (2026-08-14, kullanıcı kararıyla 80'e yükseltildi -
# bu tür isteklerin neredeyse tamamının kırpılmadan geçmesi için).
MAX_REPLY_SENTENCES_DETAILED = 80

# Faz 3: aşağıdaki üç fallback ve LLM_ERROR_FALLBACK, LLM'i hiç çağırmadan ya da
# LLM'in ürettiği içeriği tamamen görmezden gelip sabit metin döndüğü durumlar
# (bkz. run_orchestrator altındaki kullanım yerleri) - bu yüzden system prompt'taki
# "kullanıcının dilinde yanıt ver" talimatına güvenilemez, dict[language] ile
# kendileri seçiliyor (mood_support_agent.get_crisis_response ile aynı desen).
EMPTY_REPLY_WITH_TOOLS_FALLBACK = {
    "tr": (
        "Bunu kaydettim ama şu an düzgün bir özet oluşturamadım — istersen az önce "
        "yazdığını tekrar sorar mısın?"
    ),
    "en": (
        "I saved this but couldn't put together a proper summary right now — could "
        "you ask again what you just wrote?"
    ),
}

# tool_names_used boşsa (model hiçbir kayıt/işlem yapmadan boş içerikle
# durduysa) yukarıdaki metni kullanmak YANLIŞ — "kaydettim" diyor ama
# hiçbir şey kaydedilmedi. Canlı testte yakalandı (2026-08-05): çok sayıda
# egzersiz/öğün içeren tek bir uzun mesajda model bazen hiç tool çağırmadan
# boş content ile duruyor, o durumda kullanıcıya dürüst bir "kaydedemedim"
# mesajı gösterilmeli.
EMPTY_REPLY_NO_TOOLS_FALLBACK = {
    "tr": (
        "Bunu işleyemedim, hiçbir şey kaydetmedim — mesajı biraz daha kısa "
        "parçalara bölüp tekrar gönderir misin?"
    ),
    "en": (
        "I couldn't process this, nothing was saved — could you break the message "
        "into smaller parts and send it again?"
    ),
}

# Yukarıdaki iki fallback SADECE content BOŞSA devreye giriyordu. Canlı testte
# yakalandı (2026-08-07): model hiç tool ÇAĞIRMADAN (tool_names_used boş) ama
# TAM, kendinden emin bir cümleyle "Bu ilerlemeyi kaydettim, tebrik ederim!"
# gibi bir yanıt üretebiliyor — content boş olmadığı için content boşluğu
# kontrolü bunu hiç yakalamıyor, kullanıcı hiçbir şey kaydedilmediği halde
# kaydedildiğini sanıyor (sessiz veri kaybı, EMPTY_REPLY'den daha tehlikeli
# çünkü fark edilmiyor). Bu regex, tool_names_used boşken yanıtın yine de bir
# kayıt/loglama BAŞARISI iddia edip etmediğini yakalayan bir güvenlik ağı —
# NLU değil, bilinen "başarıyla kaydettim" kalıplarına dayalı kaba bir
# sezgisel kontrol (yanlış negatif olabilir ama yanlış pozitif riski düşük
# tutulmaya çalışıldı, "ekledim"/"işledim" gibi çok genel fiiller BİLEREK
# dışlandı).
_FALSE_SUCCESS_CLAIM_RE = re.compile(
    r"kaydet(t[iı]m|t[iı]k)|kayded(ildi|iliyor)|kayda geç(irdim|ti)|logla(d[iı]m|nd[iı])"
)

# Faz 3: yukarıdaki regex sadece Türkçe kalıpları yakalıyor - preferred_language
# "en" olan bir kullanıcıda model İngilizce bir sahte-başarı iddiası üretirse
# (ör. "I've saved this workout!") aynı güvenlik ağı ondan da geçmeli. Türkçe
# taraftaki gibi "added"/"processed" gibi çok genel fiiller BİLEREK dışlandı.
_FALSE_SUCCESS_CLAIM_RE_EN = re.compile(
    r"\bi(?:'ve| have)? (?:saved|logged|recorded)\b"
    r"|\b(?:saved|logged|recorded) (?:it|this|that)\b"
    r"|\b(?:has|have) been (?:saved|logged|recorded)\b"
)


# "Kaydettim" iddiası bir YAZMA işlemiyle ilgili - başka bir aracın (ör.
# katalog araması) başarılı olması, başarısız bir kaydı örtmemeli.
_WRITE_TOOLS = {
    "update_user_profile",
    "log_progress",
    "log_exercise_set",
    "log_exercise_sets_bulk",
    "set_exercise_goal",
    "log_meal",
    "log_meals_bulk",
}


def _has_false_success_claim(reply: str, language: str) -> bool:
    if language == "en":
        return bool(_FALSE_SUCCESS_CLAIM_RE_EN.search(reply.lower()))
    return bool(_FALSE_SUCCESS_CLAIM_RE.search(tr_lower(reply)))

LLM_ERROR_FALLBACK = {
    "tr": (
        "Şu anda sana bağlanmakta sorun yaşıyorum (yapay zeka servisi yanıt vermiyor) — "
        "birazdan tekrar dener misin?"
    ),
    "en": (
        "I'm having trouble connecting right now (the AI service isn't responding) — "
        "could you try again in a bit?"
    ),
}

_TOOL_TO_AGENT = {
    "get_user_profile": "profile_agent",
    "update_user_profile": "profile_agent",
    "search_nutrition_knowledge": "nutrition_agent",
    "search_exercise_knowledge": "exercise_agent",
    "log_progress": "tracking_agent",
    "get_weekly_summary": "tracking_agent",
    "generate_encouragement": "motivation_agent",
    "generate_checkin_message": "motivation_agent",
    "generate_supportive_response": "mood_support_agent",
    "search_exercise_catalog": "workout_tracking_agent",
    "log_exercise_set": "workout_tracking_agent",
    "log_exercise_sets_bulk": "workout_tracking_agent",
    "get_workout_summary": "workout_tracking_agent",
    "set_exercise_goal": "workout_tracking_agent",
    "get_exercise_goals": "workout_tracking_agent",
    "search_food_catalog": "nutrition_tracking_agent",
    "log_meal": "nutrition_tracking_agent",
    "log_meals_bulk": "nutrition_tracking_agent",
    "get_daily_nutrition_summary": "nutrition_tracking_agent",
}


def _resolve_agent_used(tool_names: set[str]) -> str:
    agents_used = sorted({_TOOL_TO_AGENT[name] for name in tool_names if name in _TOOL_TO_AGENT})
    return "+".join(agents_used) if agents_used else "orchestrator"


def _cap_sentence_count(content: str, max_sentences: int) -> str:
    """Yanıtı en fazla max_sentences tamamlanmış cümleye kırpar. Son cümle
    noktalama içermiyorsa (ör. liste/emoji ile biten yanıt) dokunmadan bırakır."""
    matches = _sentence_end_matches(content)
    if len(matches) <= max_sentences:
        return content
    return content[: matches[max_sentences - 1].end()]


def _clean_truncated_reply(message: AIMessage, user_message: str = "") -> str:
    """num_predict sınırına takılıp cümle ortasında kesilen yanıtları son
    tamamlanmış cümlede düzgünce kırpar, ardından üç katmanlı bir cümle
    sayısı tavanı uygular: kullanıcı açıkça KISA istediyse (_BRIEF_REQUEST_RE)
    MAX_REPLY_SENTENCES_BRIEF, açıkça DETAY istediyse (_DETAIL_REQUEST_RE)
    MAX_REPLY_SENTENCES_DETAILED, hiçbiri belirtilmemişse MAX_REPLY_
    SENTENCES_MEDIUM. İkisi de eşleşirse (çelişkili istek) BRIEF kazanır."""
    content = message.content
    if message.response_metadata.get("done_reason") == "length":
        matches = _sentence_end_matches(content)
        if matches:
            content = content[: matches[-1].end()]
    return _cap_sentence_count(content, _max_sentences_for(user_message))


def _max_sentences_for(user_message: str) -> int:
    if _BRIEF_REQUEST_RE.search(user_message):
        return MAX_REPLY_SENTENCES_BRIEF
    if _DETAIL_REQUEST_RE.search(user_message):
        return MAX_REPLY_SENTENCES_DETAILED
    return MAX_REPLY_SENTENCES_MEDIUM


# Kullanıcı canlı testte tekrar tekrar yakaladı (2026-08-31): uzun/çok
# egzersizli mesajlarda ana ajan döngüsü tool-call'ları BAŞARIYLA çalıştırıp
# veriyi kaydettikten SONRA bazen boş içerikli bir final mesajla bitiyordu
# (gemma4:e4b, reasoning=True - "düşünme" bütçesi görünür yanıtı hiç
# üretmeden tükeniyor olabilir, done_reason genelde "length"). Veri zaten
# güvende - sadece GÖRÜNÜR özet metni eksik. Kullanıcıya hemen "özetleyemedim"
# demek yerine, AYNI tool-çağrı sonuçlarını içeren mesaj geçmişiyle TEK bir ek
# (araç ÇAĞIRMAYAN, düz) LLM çağrısı yapıp modelden SADECE bir özet metni
# isteniyor - bu çok daha kısa/odaklı bir istek olduğu için genelde başarıyor
# (canlı testte doğrulandı). Bu da boş dönerse (nadir), çağıran taraf yine
# sabit fallback'e düşer - retry veri kaybı riski taşımıyor, sadece ekstra
# bir LLM çağrısı maliyeti var ve SADECE bu nadir hata durumunda tetikleniyor.
_EMPTY_REPLY_RETRY_NUDGE = {
    "tr": (
        "Az önce yukarıdaki setleri/öğünleri başarıyla kaydettin ama bana "
        "görünür bir özet mesajı yazmadın. Şimdi SADECE kısa bir özet mesajı "
        "yaz — hiçbir araç (tool) çağırma, sadece kullanıcıya ne kaydettiğini "
        "özetleyen düz metin yaz."
    ),
    "en": (
        "You just successfully logged the sets/meals above but didn't write a "
        "visible summary message. Now write ONLY a short summary message — do "
        "not call any tool, just plain text summarizing what was logged."
    ),
}


def _retry_empty_reply(llm, output_messages: list[BaseMessage], language: str) -> str:
    nudge = HumanMessage(content=_EMPTY_REPLY_RETRY_NUDGE[language])
    try:
        retry_message = llm.invoke([*output_messages, nudge])
    except Exception:
        logger.exception("Empty-reply retry invoke başarısız oldu")
        return ""
    return _clean_truncated_reply(retry_message, "")


def _load_history(db: Session, user_id: int, limit: int = 20) -> list[BaseMessage]:
    query = db.query(Conversation).filter(Conversation.user_id == user_id)
    # Kullanıcı "Sohbeti Sıfırla" kullandıysa (bkz. conversation_service.
    # soft_clear) koç da tıpkı ekrandaki gibi sıfırlama ANINDAN önceki
    # geçmişi bağlam olarak GÖRMEMELİ - aksi halde ekranda "temiz sayfa"
    # gösterip arka planda eski konuya devam ediyormuş gibi cevap verirdi.
    cleared_at = conversation_service.get_cleared_at(db, user_id)
    if cleared_at is not None:
        query = query.filter(Conversation.timestamp > cleared_at)
    rows = query.order_by(Conversation.timestamp.desc()).limit(limit).all()
    rows.reverse()

    messages: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            messages.append(HumanMessage(content=row.content))
        else:
            messages.append(AIMessage(content=row.content))
    return messages


@dataclass
class _PreparedRun:
    agent: object
    inputs: dict
    language: str
    user_message: str
    model_name: str | None
    user_id: int


def _prepare(db: Session, user_id: int, user_message: str, model_name: str | None) -> _PreparedRun | tuple[str, str]:
    """Araçları, sistem prompt'unu ve geçmişi hazırlar. Kriz sinyalinde LLM'e hiç
    sorulmadan sabit şablon (yanıt, ajan) döner."""
    language = profile_service.get_language(db, user_id)

    if check_crisis_indicators(user_message):
        # Kriz sinyali tespit edildiğinde LLM'e hiç sorulmadan sabit şablon
        # döner ve konuşma normal akışa geri döndürülmez. Sadece "tetiklendi"
        # bilgisi loglanır, mesaj içeriği loglanmaz.
        logger.warning("Crisis protocol triggered for user_id=%s", user_id)
        return get_crisis_response(language), "mood_support_agent"

    tools = [
        *build_profile_tools(db, user_id),
        *build_nutrition_tools(),
        *build_exercise_tools(),
        *build_tracking_tools(db, user_id),
        *build_workout_tracking_tools(db, user_id),
        *build_nutrition_tracking_tools(db, user_id),
        *build_motivation_tools(db, user_id),
        *build_mood_support_tools(),
    ]

    mood_log = mood_service.get_mood(db, user_id)
    mood_labels = mood_service.MOOD_LABELS_EN if language == "en" else mood_service.MOOD_LABELS
    mood_label = mood_labels.get(mood_log.mood_key) if mood_log else None
    persistent_low_mood = mood_service.is_persistent_low_mood(db, user_id)
    # coach_tone: önceden SADECE push/check-in mesajlarını etkiliyordu,
    # interaktif sohbet hiç kullanmıyordu - kullanıcı fark edip sordu
    # (2026-08-13): "Koç Tonu" ayarı hem mantıklı hem beklenen davranış
    # koçun HER YERDE aynı ton olması, sadece bildirimlerde değil.
    coach_tone = profile_service.get_coach_tone(db, user_id)
    system_prompt = build_orchestrator_system_prompt(mood_label, persistent_low_mood, language, coach_tone)
    agent = create_agent(get_llm(model_name), tools, system_prompt=system_prompt)

    history = _load_history(db, user_id)
    return _PreparedRun(
        agent=agent,
        inputs={"messages": [*history, HumanMessage(content=user_message)]},
        language=language,
        user_message=user_message,
        model_name=model_name,
        user_id=user_id,
    )


# max_concurrency=1: bir turda birden fazla tool-call gelirse (ör. tek
# mesajda onlarca set/öğün loglanması) ToolNode bunları thread pool ile
# paralel çalıştırıyor, ama hepsi aynı SQLAlchemy `db` session'ını
# paylaşıyor ve session thread-safe değil — paralel çalıştırma
# "session is in 'prepared' state" hatasıyla çöküyordu. Sıralı çalıştırma
# bunu engeller.
_AGENT_CONFIG = {"max_concurrency": 1}


def _successful_tool_names(messages: list[BaseMessage]) -> set[str]:
    # 2026-09-23 (eval/chat_regression.py ile yakalandı): bir araç ÇAĞRILIP
    # hata verdiğinde (ör. doğrulama hatası, ToolMessage.status="error") model
    # yine de "kaydettim" diyebiliyordu - sahte başarı koruması "çağrıldı"yı
    # "başarılı" sanıp devreye girmiyordu. Koruma artık sadece HATASIZ dönen
    # araç çağrılarını sayıyor.
    return {msg.name for msg in messages if isinstance(msg, ToolMessage) and msg.status != "error" and msg.name}


def _finalize(run: _PreparedRun, output_messages: list[BaseMessage]) -> tuple[str, str]:
    """Ajanın mesajlarından son yanıtı çıkarır ve korumaları uygular (kırpma,
    boş yanıtta yeniden deneme, sahte "kaydettim" iddiası)."""
    tool_names_used = {
        call["name"] for msg in output_messages for call in getattr(msg, "tool_calls", None) or []
    }
    agent_used = _resolve_agent_used(tool_names_used)
    successful_tool_names = _successful_tool_names(output_messages)

    final_message = output_messages[-1]
    reply = _clean_truncated_reply(final_message, run.user_message) if isinstance(final_message, AIMessage) else ""
    if not reply.strip():
        # Özellikle uzun/karmaşık mesajlarda (çok sayıda tool-call içeren ya
        # da hiç tool-call yapmadan) model bazen boş content üretiyor (200
        # dönüyor ama kullanıcı boş bir balon görüyor). Sessizce boş yanıt
        # döndürmek yerine fallback ver.
        logger.warning(
            "Empty reply from LLM for user_id=%s (agent_used=%s, tools_called=%d)",
            run.user_id,
            agent_used,
            len(tool_names_used),
        )
        retry_reply = (
            _retry_empty_reply(get_llm(run.model_name), output_messages, run.language) if successful_tool_names else ""
        )
        if retry_reply.strip():
            logger.info("Empty-reply retry basarili oldu (user_id=%s)", run.user_id)
            return retry_reply, agent_used
        fallback = EMPTY_REPLY_WITH_TOOLS_FALLBACK if successful_tool_names else EMPTY_REPLY_NO_TOOLS_FALLBACK
        reply = fallback[run.language]
    elif not (successful_tool_names & _WRITE_TOOLS) and _has_false_success_claim(reply, run.language):
        # content DOLU ama hiç tool çağrılmamış, üstelik model yine de bir
        # kayıt başarısı iddia ediyor — yukarıdaki EMPTY_REPLY dalının
        # yakalayamadığı, sessiz veri kaybına yol açan hallüsinasyon durumu.
        logger.warning(
            "Hallucinated save claim with zero tool calls for user_id=%s: %r",
            run.user_id,
            reply,
        )
        reply = EMPTY_REPLY_NO_TOOLS_FALLBACK[run.language]
    return reply, agent_used


def run_orchestrator(
    db: Session, user_id: int, user_message: str, model_name: str | None = None
) -> tuple[str, str]:
    """Kullanıcı mesajını orchestrator'a iletir, yanıtı ve kullanılan agent(lar)ı döner.

    model_name verilirse settings.llm_model_name yerine onu kullanır (model
    karşılaştırma eval script'i için — prod akışı hep None geçer)."""
    run = _prepare(db, user_id, user_message, model_name)
    if isinstance(run, tuple):
        return run
    try:
        result = run.agent.invoke(run.inputs, config=_AGENT_CONFIG)  # type: ignore[attr-defined]
    except Exception:
        # Ollama'ya bağlanamama, model timeout'u ya da beklenmedik bir
        # LangChain hatası - hiçbiri kullanıcıya çıplak 500 olarak yansımamalı,
        # sohbet akışı çıplak bir hata sayfası yerine anlaşılır bir mesajla devam etmeli.
        logger.exception("LLM invoke başarısız oldu (user_id=%s)", user_id)
        return LLM_ERROR_FALLBACK[run.language], "orchestrator"
    return _finalize(run, result["messages"])


# ---------------------------------------------------------------------------
# Akışlı sohbet (2026-09-26): yanıt parça parça, araç çalışırken durum etiketi.
# Son aşamadaki korumalar (kırpma, sahte "kaydettim", boş yanıt) yalnızca tam
# metin üzerinde kesinleşebildiği için akış bir TASLAKTIR: sonda gelen "done"
# olayındaki metin kesin yanıttır ve istemci taslağı onunla değiştirir (çoğu
# zaman ikisi aynıdır). Akış sırasında da aynı cümle tavanı uygulanır ve yazma
# aracı başarılı olmadan "kaydettim" iddiası görülürse taslak durdurulur.
# ---------------------------------------------------------------------------

TOOL_STATUS_LABELS = {
    "search_nutrition_knowledge": {"tr": "Beslenme bilgilerine bakıyorum", "en": "Checking nutrition knowledge"},
    "search_exercise_knowledge": {"tr": "Egzersiz bilgilerine bakıyorum", "en": "Checking exercise knowledge"},
    "search_food_catalog": {"tr": "Besin kataloğunda arıyorum", "en": "Searching the food catalog"},
    "search_exercise_catalog": {"tr": "Egzersiz kataloğunda arıyorum", "en": "Searching the exercise catalog"},
    "log_meal": {"tr": "Öğünün kaydediliyor", "en": "Logging your meal"},
    "log_meals_bulk": {"tr": "Öğünlerin kaydediliyor", "en": "Logging your meals"},
    "log_exercise_set": {"tr": "Antrenmanın kaydediliyor", "en": "Logging your workout"},
    "log_exercise_sets_bulk": {"tr": "Antrenmanın kaydediliyor", "en": "Logging your workout"},
    "log_progress": {"tr": "Ölçümün kaydediliyor", "en": "Logging your measurement"},
    "update_user_profile": {"tr": "Profilin güncelleniyor", "en": "Updating your profile"},
    "set_exercise_goal": {"tr": "Hedefin kaydediliyor", "en": "Saving your goal"},
}
_DEFAULT_TOOL_LABEL = {"tr": "Verilerine bakıyorum", "en": "Checking your data"}
_MODEL_NODE = "model"  # langchain create_agent'ın model düğümü


def tool_status_label(tool_name: str, language: str) -> str:
    return TOOL_STATUS_LABELS.get(tool_name, _DEFAULT_TOOL_LABEL)[language if language in ("tr", "en") else "tr"]


@dataclass
class _DraftState:
    """Akıştaki görünür taslak - bir model turunda biriken metin."""

    max_sentences: int
    language: str
    text: str = ""
    sent: int = 0
    stopped: bool = False
    successful_tools: set[str] = field(default_factory=set)

    def push(self, delta: str) -> str:
        """Yeni parçayı ekler, istemciye gönderilecek kısmı döner (boş olabilir)."""
        if self.stopped or not delta:
            return ""
        self.text += delta
        # Tavandaki son cümle bitince HEMEN dur: sonrasını göstermek, kesin yanıtta
        # kırpılacak bir yarım cümlenin ekranda belirip kaybolması demekti (denendi).
        # Böylece kesin yanıt taslağa en fazla ekleme yapar, geri almaz.
        matches = _sentence_end_matches(self.text)
        visible = self.text
        if len(matches) >= self.max_sentences:
            visible = self.text[: matches[self.max_sentences - 1].end()]
            self.stopped = True
        if not (self.successful_tools & _WRITE_TOOLS) and _has_false_success_claim(visible, self.language):
            self.stopped = True  # sahte "kaydettim" - kesin yanıt done'da gelir
            return ""
        out = visible[self.sent :]
        self.sent = len(visible)
        return out

    def reset(self) -> bool:
        had_text = self.sent > 0
        self.text, self.sent, self.stopped = "", 0, False
        return had_text


class _StreamCollector(BaseCallbackHandler):
    """Ajanın geri çağırmalarından taslak parçaları ve araç olaylarını kuyruğa
    yazar. `tap_output_iter/aiter` metotları LangChain'in akış işleyicisi
    arayüzü (runtime_checkable Protocol): bunlar tanımlıyken sohbet modeli
    invoke içinde de parça parça üretir ve on_llm_new_token çağrılır -
    LangGraph'ın stream_mode="messages" düzeneği de aynı yolu kullanıyor."""

    def __init__(self, draft: _DraftState, events: "queue.Queue[dict | None]") -> None:
        self.draft = draft
        self.events = events
        self.model_runs: set[UUID] = set()
        self.lock = threading.Lock()

    def tap_output_iter(self, run_id, output):  # noqa: ARG002 - arayüz
        return output

    def tap_output_aiter(self, run_id, output):  # noqa: ARG002 - arayüz
        return output

    def on_chat_model_start(self, serialized, messages, *, run_id, metadata=None, **kwargs):  # noqa: ARG002
        # Yalnızca ana model düğümü: bazı araçlar (motivasyon/destek) kendi
        # içinde LLM çağırıyor, onların parçaları taslağa karışmamalı.
        if (metadata or {}).get("langgraph_node") == _MODEL_NODE:
            with self.lock:
                self.model_runs.add(run_id)

    def on_llm_new_token(self, token, *, chunk=None, run_id, **kwargs):  # noqa: ARG002
        if run_id not in self.model_runs:
            return
        message = getattr(chunk, "message", None)
        if getattr(message, "tool_call_chunks", None):
            return
        with self.lock:
            delta = self.draft.push(token)
        if delta:
            self.events.put({"type": "token", "text": delta})

    def on_llm_end(self, response, *, run_id, **kwargs):  # noqa: ARG002
        if run_id not in self.model_runs:
            return
        generations = response.generations[0] if response.generations else []
        message = getattr(generations[0], "message", None) if generations else None
        if getattr(message, "tool_calls", None):
            # Model araç çağırmaya geçti: önceki taslak son yanıt değildi.
            with self.lock:
                had_text = self.draft.reset()
            if had_text:
                self.events.put({"type": "reset"})

    def on_tool_start(self, serialized, input_str, *, run_id, **kwargs):  # noqa: ARG002
        name = (serialized or {}).get("name") or kwargs.get("name") or ""
        self.events.put({"type": "tool", "label": tool_status_label(name, self.draft.language)})

    def on_tool_end(self, output, *, run_id, **kwargs):  # noqa: ARG002
        name = kwargs.get("name") or getattr(output, "name", None)
        if name and getattr(output, "status", "success") != "error":
            with self.lock:
                self.draft.successful_tools.add(name)


class ChatStream:
    """Akışlı sohbet turu. Ajan `run_orchestrator` ile AYNI biçimde (invoke,
    max_concurrency=1 - araçlar sırayla, paylaşılan DB oturumu güvende) ayrı bir
    iş parçacığında çalışır; olaylar kuyruktan okunur.

    Not (2026-09-26): LangGraph'ın stream_mode="messages" düzeni max_concurrency=1
    ile kilitleniyor (tek çalışan iş parçacığı akış kuyruğunu bekliyor - yerelde
    tekrarlandı), max_concurrency kaldırılırsa da aynı turdaki araçlar paralel
    çalışıp paylaşılan DB oturumunu bozar. Bu yüzden geri çağırma kullanılıyor.

    Olaylar: {"type": "tool", "label"}, {"type": "token", "text"}, {"type": "reset"},
    en sonda {"type": "done", "reply", "agent_used"} (kesin yanıt).
    """

    def __init__(self, db: Session, user_id: int, user_message: str) -> None:
        self._events: queue.Queue[dict | None] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._result: tuple[str, str] | None = None
        self._output: list[BaseMessage] | None = None
        self._failed = False
        prepared = _prepare(db, user_id, user_message, None)
        if isinstance(prepared, tuple):
            self._run = None
            self._result = prepared
            return
        self._run = prepared
        draft = _DraftState(max_sentences=_max_sentences_for(user_message), language=prepared.language)
        self._collector = _StreamCollector(draft, self._events)
        self._thread = threading.Thread(target=self._work, name="chat-stream", daemon=True)
        self._thread.start()

    def _work(self) -> None:
        assert self._run is not None
        try:
            result = self._run.agent.invoke(  # type: ignore[attr-defined]
                self._run.inputs, config={**_AGENT_CONFIG, "callbacks": [self._collector]}
            )
            self._output = result["messages"]
        except Exception:
            logger.exception("LLM stream başarısız oldu (user_id=%s)", self._run.user_id)
            self._failed = True
        finally:
            self._events.put(None)

    def result(self) -> tuple[str, str]:
        """Kesin (yanıt, ajan). Tur bitmediyse bekler - istemci bağlantıyı kopardıysa
        bile tur tamamlanıp kaydedilebilsin diye."""
        if self._result is None:
            assert self._run is not None and self._thread is not None
            self._thread.join()
            if self._failed or self._output is None:
                self._result = (LLM_ERROR_FALLBACK[self._run.language], "orchestrator")
            else:
                self._result = _finalize(self._run, self._output)
        return self._result

    def events(self) -> Iterator[dict]:
        if self._thread is not None:
            while (event := self._events.get()) is not None:
                yield event
        reply, agent_used = self.result()
        yield {"type": "done", "reply": reply, "agent_used": agent_used}
