"""Push bildirim içerik havuzları.

Aynı `content/daily_tips.py`'deki "içerik havuzu + random.choice" deseni
kullanılıyor (frontend'deki `MOOD_PLACEHOLDERS` gibi tek-varyantlı bir
sözlük DEĞİL - burada "birkaç varyanttan rastgele seç" isteniyor, hem PR/
hedef bildirimlerinde tekrarı azaltmak hem tonu doğal hissettirmek için).

PR/Hedef bildirimleri SENKRON set-kaydı yolunda gönderiliyor (LLM
KULLANILMIYOR - hem hızı düşürür hem tonu güvenilir kontrol edemeyiz) - bu
yüzden burada sabit şablon varyantları var. Haftalık/günlük check-in
bildirimleri ise ASENKRON bir job'dan gönderiliyor, o ikisi LLM ile
üretiliyor (bkz. motivation_agent.py) - ama LOCK SCREEN'de görünen BAŞLIK
yine buradan, jenerik bir havuzdan geliyor (gizlilik kararı: mood/kilo gibi
hassas olabilecek gerçek mesaj metni lock screen'de ASLA gösterilmez).
"""

import random

# PR (kişisel rekor) bildirimleri hassas değil - başlıkta egzersiz adı gibi
# spesifik bilgi olabilir (kullanıcı kararı). {exercise} ve {weight} format
# alanlarını alır.
PR_TEMPLATES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "tr": {
        "sicak": [
            ("{exercise}'ta yeni rekor! 🏆", "Kendine ne kadar emek verdiğin belli, tebrikler!"),
            ("Harika bir gelişme: {exercise}'ta {weight} kg 🎉", "Bu adımı attığın için kendinle gurur duy."),
            ("{exercise}'ta kendini geçtin! 🏆", "Küçük küçük ama gerçek bir ilerleme — böyle devam."),
        ],
        "enerjik": [
            ("REKOR! {exercise}'ta {weight} kg 🔥", "Bu tempoyla nereye kadar gidersin, merak ediyorum!"),
            ("{exercise}'ta yeni zirve! 💪", "Enerjini görüyorum, devam et!"),
            ("Bomba bir set: {exercise}'ta {weight} kg 🚀", "Bu gidişle bir sonraki hedef de yakın!"),
        ],
        "notr": [
            ("{exercise}'ta yeni rekor 🏆", "{weight} kg ile önceki en iyini geçtin."),
            ("Kişisel rekor: {exercise} — {weight} kg", "Antrenman geçmişine kaydedildi."),
            ("{exercise}'ta ilerleme kaydettin", "Yeni en iyi ağırlık: {weight} kg."),
        ],
    },
    "en": {
        "sicak": [
            ("New record in {exercise}! 🏆", "You can tell how much effort you've put in — congrats!"),
            ("Great progress: {weight} kg in {exercise} 🎉", "Be proud of yourself for this step."),
            ("You outdid yourself in {exercise}! 🏆", "Small but real progress — keep it up."),
        ],
        "enerjik": [
            ("RECORD! {weight} kg in {exercise} 🔥", "At this pace, who knows where you'll end up!"),
            ("New peak in {exercise}! 💪", "I can feel the energy, keep going!"),
            ("Huge set: {weight} kg in {exercise} 🚀", "The next goal is close at this rate!"),
        ],
        "notr": [
            ("New record in {exercise} 🏆", "You beat your previous best with {weight} kg."),
            ("Personal record: {exercise} — {weight} kg", "Logged to your workout history."),
            ("Progress in {exercise}", "New best weight: {weight} kg."),
        ],
    },
}

# Egzersiz hedefine ulaşma - hassas değil, {exercise} ve {target} format
# alanlarını alır.
GOAL_TEMPLATES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "tr": {
        "sicak": [
            ("{exercise} hedefine ulaştın! 🎯", "Bunun için ne kadar çalıştığını biliyorum, harikasın."),
            ("Hedefin gerçek oldu: {exercise} 🎉", "Kendine koyduğun hedefe sadık kaldın, tebrikler."),
            ("{exercise}'ta {target} kg hedefini tamamladın 💫", "Bu, sabrının ve emeğinin bir sonucu."),
        ],
        "enerjik": [
            ("HEDEF TAMAMLANDI: {exercise} 🎯🔥", "Şimdi sırada daha büyük bir hedef mi var?"),
            ("{exercise}'ta {target} kg'a ulaştın! 🚀", "Bu enerjiyle bir sonraki hedefi de koyalım!"),
            ("Başardın! {exercise} hedefi tamam 💪", "Durma, bu ivmeyi sürdür!"),
        ],
        "notr": [
            ("{exercise} hedefine ulaşıldı 🎯", "Hedef ağırlık: {target} kg."),
            ("Hedef tamamlandı: {exercise}", "{target} kg'lık hedefe ulaştın."),
            ("{exercise}'ta ilerleme: hedef karşılandı", "{target} kg."),
        ],
    },
    "en": {
        "sicak": [
            ("You reached your {exercise} goal! 🎯", "I know how much work this took — you're amazing."),
            ("Your goal became real: {exercise} 🎉", "You stayed true to the goal you set — congrats."),
            ("You completed your {target} kg goal in {exercise} 💫", "This is the result of your patience and effort."),
        ],
        "enerjik": [
            ("GOAL COMPLETE: {exercise} 🎯🔥", "What's the next bigger goal?"),
            ("You hit {target} kg in {exercise}! 🚀", "Let's set the next goal with this energy!"),
            ("You did it! {exercise} goal done 💪", "Don't stop, keep this momentum!"),
        ],
        "notr": [
            ("{exercise} goal reached 🎯", "Target weight: {target} kg."),
            ("Goal completed: {exercise}", "You reached the {target} kg goal."),
            ("Progress in {exercise}: goal met", "{target} kg."),
        ],
    },
}

# Haftalık özet + günlük hatırlatma - lock screen'de SADECE bu jenerik
# başlıklar görünür, gerçek mesaj metni asla (gizlilik kararı). Ton-bağımsız
# (tone burada YOK) - gerçek mesajın tonu zaten LLM tarafından uygulanıyor,
# lock screen başlığı sadece "yeni bir şey var" bilgisini veriyor.
CHECKIN_LOCKSCREEN_TITLES: dict[str, dict[str, list[str]]] = {
    "tr": {
        "weekly_summary": [
            "Koçundan yeni bir mesaj var",
            "Haftalık check-in'in hazır",
            "Bu haftanın özeti seni bekliyor",
        ],
        "daily_nudge": [
            "Koçundan yeni bir mesaj var",
            "Bugün için küçük bir hatırlatma",
            "Koçun seninle bir şey paylaşmak istiyor",
        ],
    },
    "en": {
        "weekly_summary": [
            "New message from your coach",
            "Your weekly check-in is ready",
            "This week's summary is waiting for you",
        ],
        "daily_nudge": [
            "New message from your coach",
            "A small reminder for today",
            "Your coach wants to share something with you",
        ],
    },
}

_DEFAULT_TONE = "notr"


def _resolve_tone(language: str, tone: str, pool: dict[str, dict[str, list[tuple[str, str]]]]) -> str:
    """Tanınmayan ton için "notr"a düşer (savunmacı - getMoodAwareSubtext'in
    `?? DEFAULT_SUBTEXT` deseniyle aynı ilke)."""
    return tone if tone in pool.get(language, pool["tr"]) else _DEFAULT_TONE


def render_pr_notification(language: str, tone: str, exercise_name: str, weight_kg: float | None) -> tuple[str, str]:
    lang = language if language in PR_TEMPLATES else "tr"
    resolved_tone = _resolve_tone(lang, tone, PR_TEMPLATES)
    title_fmt, body_fmt = random.choice(PR_TEMPLATES[lang][resolved_tone])
    weight_text = f"{weight_kg:g}" if weight_kg is not None else ""
    return title_fmt.format(exercise=exercise_name, weight=weight_text), body_fmt.format(
        exercise=exercise_name, weight=weight_text
    )


def render_goal_notification(language: str, tone: str, exercise_name: str, target_weight_kg: float) -> tuple[str, str]:
    lang = language if language in GOAL_TEMPLATES else "tr"
    resolved_tone = _resolve_tone(lang, tone, GOAL_TEMPLATES)
    title_fmt, body_fmt = random.choice(GOAL_TEMPLATES[lang][resolved_tone])
    target_text = f"{target_weight_kg:g}"
    return title_fmt.format(exercise=exercise_name, target=target_text), body_fmt.format(
        exercise=exercise_name, target=target_text
    )


def render_checkin_notification_title(language: str, kind: str) -> str:
    lang = language if language in CHECKIN_LOCKSCREEN_TITLES else "tr"
    pool = CHECKIN_LOCKSCREEN_TITLES[lang].get(kind, CHECKIN_LOCKSCREEN_TITLES[lang]["weekly_summary"])
    return random.choice(pool)
