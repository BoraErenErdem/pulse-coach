import logging
import re
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
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
from app.services import mood_service, profile_service
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

    if _BRIEF_REQUEST_RE.search(user_message):
        max_sentences = MAX_REPLY_SENTENCES_BRIEF
    elif _DETAIL_REQUEST_RE.search(user_message):
        max_sentences = MAX_REPLY_SENTENCES_DETAILED
    else:
        max_sentences = MAX_REPLY_SENTENCES_MEDIUM
    return _cap_sentence_count(content, max_sentences)


def _load_history(db: Session, user_id: int, limit: int = 20) -> list[BaseMessage]:
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.timestamp.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()

    messages: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            messages.append(HumanMessage(content=row.content))
        else:
            messages.append(AIMessage(content=row.content))
    return messages


def run_orchestrator(
    db: Session, user_id: int, user_message: str, model_name: str | None = None
) -> tuple[str, str]:
    """Kullanıcı mesajını orchestrator'a iletir, yanıtı ve kullanılan agent(lar)ı döner.

    model_name verilirse settings.llm_model_name yerine onu kullanır (model
    karşılaştırma eval script'i için — prod akışı hep None geçer)."""
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
    # max_concurrency=1: bir turda birden fazla tool-call gelirse (ör. tek
    # mesajda onlarca set/öğün loglanması) ToolNode bunları thread pool ile
    # paralel çalıştırıyor, ama hepsi aynı SQLAlchemy `db` session'ını
    # paylaşıyor ve session thread-safe değil — paralel çalıştırma
    # "session is in 'prepared' state" hatasıyla çöküyordu. Sıralı çalıştırma
    # bunu engeller.
    try:
        result = agent.invoke(
            {"messages": [*history, HumanMessage(content=user_message)]},
            config={"max_concurrency": 1},
        )
    except Exception:
        # Ollama'ya bağlanamama, model timeout'u ya da beklenmedik bir
        # LangChain hatası - hiçbiri kullanıcıya çıplak 500 olarak yansımamalı,
        # sohbet akışı çıplak bir hata sayfası yerine anlaşılır bir mesajla devam etmeli.
        logger.exception("LLM invoke başarısız oldu (user_id=%s)", user_id)
        return LLM_ERROR_FALLBACK[language], "orchestrator"

    output_messages = result["messages"]
    tool_names_used = {
        call["name"] for msg in output_messages for call in getattr(msg, "tool_calls", None) or []
    }
    agent_used = _resolve_agent_used(tool_names_used)

    final_message = output_messages[-1]
    reply = _clean_truncated_reply(final_message, user_message)
    if not reply.strip():
        # Özellikle uzun/karmaşık mesajlarda (çok sayıda tool-call içeren ya
        # da hiç tool-call yapmadan) model bazen boş content üretiyor (200
        # dönüyor ama kullanıcı boş bir balon görüyor). Sessizce boş yanıt
        # döndürmek yerine fallback ver.
        logger.warning(
            "Empty reply from LLM for user_id=%s (agent_used=%s, tools_called=%d)",
            user_id,
            agent_used,
            len(tool_names_used),
        )
        fallback = EMPTY_REPLY_WITH_TOOLS_FALLBACK if tool_names_used else EMPTY_REPLY_NO_TOOLS_FALLBACK
        reply = fallback[language]
    elif not tool_names_used and _has_false_success_claim(reply, language):
        # content DOLU ama hiç tool çağrılmamış, üstelik model yine de bir
        # kayıt başarısı iddia ediyor — yukarıdaki EMPTY_REPLY dalının
        # yakalayamadığı, sessiz veri kaybına yol açan hallüsinasyon durumu.
        logger.warning(
            "Hallucinated save claim with zero tool calls for user_id=%s: %r",
            user_id,
            reply,
        )
        reply = EMPTY_REPLY_NO_TOOLS_FALLBACK[language]
    return reply, agent_used
