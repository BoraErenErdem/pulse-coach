"""Push bildirim içerik havuzları.

Aynı `content/daily_tips.py`'deki "içerik havuzu + random.choice" deseni
kullanılıyor (frontend'deki `MOOD_PLACEHOLDERS` gibi tek-varyantlı bir
sözlük DEĞİL - burada "birkaç varyanttan rastgele seç" isteniyor, hem PR/
hedef bildirimlerinde tekrarı azaltmak hem tonu doğal hissettirmek için).

Push metinlerinin HİÇBİRİ kişisel/sağlık verisi taşımaz (bkz. PR_TEMPLATES notu).

PR/Hedef bildirimleri SENKRON set-kaydı yolunda gönderiliyor (LLM
KULLANILMIYOR - hem hızı düşürür hem tonu güvenilir kontrol edemeyiz) - bu
yüzden burada sabit şablon varyantları var. Haftalık/günlük check-in
bildirimleri ise ASENKRON bir job'dan gönderiliyor, o ikisi LLM ile
üretiliyor (bkz. motivation_agent.py) - ama LOCK SCREEN'de görünen BAŞLIK
yine buradan, jenerik bir havuzdan geliyor (gizlilik kararı: mood/kilo gibi
hassas olabilecek gerçek mesaj metni lock screen'de ASLA gösterilmez).
"""

import random

# PR ve hedef bildirimleri JENERİK (2026-10-05, KVKK): push metni Expo (ABD) ve
# Apple/Google bildirim altyapısından geçiyor, kilit ekranında da görünüyor.
# Önceden başlıkta egzersiz adı ve ağırlık vardı ("Squat'ta 100 kg") - bu
# sağlık/fitness verisini yurt dışına taşıyordu. Ayrıntı uygulama içinde.
PR_TEMPLATES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "tr": {
        "sicak": [
            ("Yeni bir kişisel rekorun var! 🏆", "Kendine ne kadar emek verdiğin belli, tebrikler!"),
            ("Harika bir gelişme 🎉", "Bugün kendi rekorunu geçtin, kendinle gurur duy."),
            ("Kendini geçtin! 🏆", "Küçük küçük ama gerçek bir ilerleme — böyle devam."),
        ],
        "enerjik": [
            ("REKOR! 🔥", "Bu tempoyla nereye kadar gidersin, merak ediyorum!"),
            ("Yeni zirve! 💪", "Enerjini görüyorum, devam et!"),
            ("Bomba bir set 🚀", "Bu gidişle bir sonraki hedef de yakın!"),
        ],
        "notr": [
            ("Yeni kişisel rekor 🏆", "Ayrıntısı Antrenman sekmesinde."),
            ("Kişisel rekor kaydedildi", "Önceki en iyini geçtin."),
            ("İlerleme kaydettin", "Yeni en iyin antrenman geçmişinde."),
        ],
    },
    "en": {
        "sicak": [
            ("You set a new personal record! 🏆", "You can tell how much effort you've put in — congrats!"),
            ("Great progress 🎉", "You beat your own record today — be proud of yourself."),
            ("You outdid yourself! 🏆", "Small but real progress — keep it up."),
        ],
        "enerjik": [
            ("RECORD! 🔥", "At this pace, who knows where you'll end up!"),
            ("New peak! 💪", "I can feel the energy, keep going!"),
            ("Huge set 🚀", "The next goal is close at this rate!"),
        ],
        "notr": [
            ("New personal record 🏆", "See the details in the Workouts tab."),
            ("Personal record logged", "You beat your previous best."),
            ("You made progress", "Your new best is in your workout history."),
        ],
    },
}

GOAL_TEMPLATES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "tr": {
        "sicak": [
            ("Bir hedefine ulaştın! 🎯", "Bunun için ne kadar çalıştığını biliyorum, harikasın."),
            ("Hedefin gerçek oldu 🎉", "Kendine koyduğun hedefe sadık kaldın, tebrikler."),
            ("Hedef tamam 💫", "Bu, sabrının ve emeğinin bir sonucu."),
        ],
        "enerjik": [
            ("HEDEF TAMAMLANDI 🎯🔥", "Şimdi sırada daha büyük bir hedef mi var?"),
            ("Hedefine ulaştın! 🚀", "Bu enerjiyle bir sonraki hedefi de koyalım!"),
            ("Başardın! 💪", "Durma, bu ivmeyi sürdür!"),
        ],
        "notr": [
            ("Egzersiz hedefine ulaşıldı 🎯", "Ayrıntısı Antrenman sekmesinde."),
            ("Hedef tamamlandı", "Hedef listen güncellendi."),
            ("Hedef karşılandı", "İlerlemeni Antrenman sekmesinde görebilirsin."),
        ],
    },
    "en": {
        "sicak": [
            ("You reached one of your goals! 🎯", "I know how much work this took — you're amazing."),
            ("Your goal became real 🎉", "You stayed true to the goal you set — congrats."),
            ("Goal complete 💫", "This is the result of your patience and effort."),
        ],
        "enerjik": [
            ("GOAL COMPLETE 🎯🔥", "What's the next bigger goal?"),
            ("You hit your goal! 🚀", "Let's set the next goal with this energy!"),
            ("You did it! 💪", "Don't stop, keep this momentum!"),
        ],
        "notr": [
            ("Exercise goal reached 🎯", "See the details in the Workouts tab."),
            ("Goal completed", "Your goal list has been updated."),
            ("Goal met", "You can see your progress in the Workouts tab."),
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


def render_pr_notification(language: str, tone: str) -> tuple[str, str]:
    lang = language if language in PR_TEMPLATES else "tr"
    return random.choice(PR_TEMPLATES[lang][_resolve_tone(lang, tone, PR_TEMPLATES)])


def render_goal_notification(language: str, tone: str) -> tuple[str, str]:
    lang = language if language in GOAL_TEMPLATES else "tr"
    return random.choice(GOAL_TEMPLATES[lang][_resolve_tone(lang, tone, GOAL_TEMPLATES)])


def render_checkin_notification_title(language: str, kind: str) -> str:
    lang = language if language in CHECKIN_LOCKSCREEN_TITLES else "tr"
    pool = CHECKIN_LOCKSCREEN_TITLES[lang].get(kind, CHECKIN_LOCKSCREEN_TITLES[lang]["weekly_summary"])
    return random.choice(pool)
