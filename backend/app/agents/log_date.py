"""Sohbetten geçmiş güne kayıt (`days_ago`) - kayıt araçlarının ortak kuralı.

2026-09-26 canlı test: "dün yüzdüm" bugüne yazılıyor, koç yine de "dünkü
yüzmen" diyordu. Araçlar artık `days_ago` alıyor (dün=1); servisler zaten
session_date/log_date kabul ediyordu. Değer LLM'den geldiği için None kabul
edilir ve aralık dışı değerler KAYDEDİLMEZ (sessizce kırpmak yanlış güne
yazardı): negatif = gelecek ("yarın koşacağım" bir kayıt değil).
"""

import re
from datetime import date, datetime, timedelta, timezone, tzinfo

from sqlalchemy.orm import Session

from app.services.fuzzy_match import tr_lower
from app.services.user_time import user_today

MAX_DAYS_AGO = 7

_TR_MONTHS = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)
_TR_WEEKDAYS = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")


def format_tr_date(day: date) -> str:
    return f"{day.day} {_TR_MONTHS[day.month - 1]}"


def today_context(day: date) -> str:
    """System prompt'taki tarih satırı - "cumartesi" gibi ifadeleri çözebilsin diye."""
    return f"{format_tr_date(day)} {day.year}, {_TR_WEEKDAYS[day.weekday()]}"


_NUMBER_WORDS = {"bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, "yedi": 7}
# Sıra önemli: "dünden önceki gün" "dün"den ÖNCE yakalanmalı.
_RELATIVE_DAY_PATTERNS = (
    (re.compile(r"\b(evvelsi gün|dünden önceki gün|önceki gün)"), lambda m: 2),
    (re.compile(r"\b(\d|bir|iki|üç|dört|beş|altı|yedi) gün önce"), lambda m: _NUMBER_WORDS.get(m.group(1)) or int(m.group(1))),
    (re.compile(r"\bdün(kü)?\b"), lambda m: 1),
)


# Mesajda bunlardan biri varsa kayıtlar farklı günlere ait olabilir - tek gün varsayılmaz.
_OTHER_DAY_MARKERS = re.compile(r"\b(bugün|bu sabah|bu öğle|bu akşam|bu gece|yarın|şimdi)")


def _mentioned_days(message: str) -> set[int]:
    text = tr_lower(message)
    days: set[int] = set()
    for pattern, to_days in _RELATIVE_DAY_PATTERNS:
        for match in pattern.finditer(text):
            days.add(to_days(match))
        text = pattern.sub(" ", text)
    return days


def expected_days_ago(message: str) -> int | None:
    """Mesaj TEK bir geçmiş günü anıyor ve başka bir güne işaret etmiyorsa o günün
    days_ago değeri (araçlar modelin farklı değerini bununla ezer), yoksa None.
    2026-09-28 canlı test: "önceki gün bisiklet sürdüm" - ipucu "2 gün önce, 'dün'
    DEĞİL" dediği halde model days_ago=1 verdi."""
    days = _mentioned_days(message)
    if len(days) != 1 or _OTHER_DAY_MARKERS.search(tr_lower(message)):
        return None
    ago = next(iter(days))
    return ago if 1 <= ago <= MAX_DAYS_AGO else None


_YESTERDAY_WORD_RE = re.compile(r"\b([Dd])ün\b")


def fix_wrong_yesterday(reply: str, message: str) -> str:
    """Kullanıcı 2+ gün önceyi andıysa ("önceki gün", "3 gün önce") ve kendisi
    "dün" demediyse yanıttaki "dün" kelimesini kullanıcının ifadesiyle değiştirir.
    2026-09-28 eval: kayıt doğru güne yazıldığı halde model 3 denemenin 2'sinde
    "Dün, yani 26 Eylül" dedi ("önceki gün"ü dün sanıyor; ipucu ve araç notu yetmedi)."""
    ago = expected_days_ago(message)
    lowered = tr_lower(message)
    if ago is None or ago < 2 or _YESTERDAY_WORD_RE.search(lowered):
        return reply
    phrase = next(
        (m.group(0) for pattern, _ in _RELATIVE_DAY_PATTERNS[:2] for m in pattern.finditer(lowered)),
        None,
    )
    if phrase is None:
        return reply

    def _replace(match: re.Match[str]) -> str:
        return phrase[0].upper() + phrase[1:] if match.group(1) == "D" else phrase

    return _YESTERDAY_WORD_RE.sub(_replace, reply)


def relative_day_hint(message: str, today: date) -> str | None:
    """Mesajdaki TEK göreli günü ("dün", "evvelsi gün", "3 gün önce") koda
    çözdürüp modele somut tarih olarak verir. 2026-09-27 eval: model "evvelsi
    gün" kaydını çoğu kez doğru güne yazıp yanıtta yine "dün" diyordu, bir kez
    de 1 gün önceye yazdı. Birden fazla/aralık dışı gün varsa ipucu verilmez."""
    days = _mentioned_days(message)
    if len(days) != 1:
        return None
    ago = days.pop()
    if not 1 <= ago <= MAX_DAYS_AGO:
        return None
    label = format_tr_date(today - timedelta(days=ago))
    wrong = "" if ago == 1 else ", 'dün' DEĞİL"
    return (
        f"Kullanıcının bu mesajda andığı gün {label} ({ago} gün önce{wrong}). Bu güne ait bir "
        f"kayıt için kayıt aracına days_ago={ago} ver ve yanıtında '{label}' tarihini kullan."
    )


def history_date_label(timestamp: datetime | None, zone: tzinfo, today: date) -> str | None:
    """Sohbet geçmişindeki bir mesajın (bugünden farklıysa) yerel gün etiketi.
    Zaman damgası SQLite'ta saat dilimsiz UTC tutuluyor."""
    if timestamp is None:
        return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    day = timestamp.astimezone(zone).date()
    if day == today:
        return None
    return "dün" if (today - day).days == 1 else format_tr_date(day)


def resolve_log_date(db: Session, user_id: int, days_ago: int | None, expected: int | None = None) -> date | str:
    """Kaydın tarihi ya da (kaydedilmemesi gerekiyorsa) "Kaydedilmedi" ile
    başlayan bir mesaj - orkestratör bu öneki başarısız kayıt sayar. `expected`:
    kullanıcı mesajından kodla çözülen gün (bkz. expected_days_ago); verilmişse
    modelin gelecek-dışı değerini ezer."""
    today = user_today(db, user_id)
    if expected is not None and (days_ago is None or days_ago >= 0):
        days_ago = expected
    if not days_ago:
        return today
    if days_ago < 0:
        return (
            "Kaydedilmedi: gelecekteki bir gün kaydedilemez. Kullanıcı henüz yapmadığı "
            "bir şeyi anlatıyor; kaydetmediğini söyle, yaptıktan sonra yazmasını iste."
        )
    if days_ago > MAX_DAYS_AGO:
        return (
            f"Kaydedilmedi: sohbetten en fazla {MAX_DAYS_AGO} gün öncesine kayıt "
            "yapılabiliyor. Bunu kullanıcıya söyle."
        )
    return today - timedelta(days=days_ago)


def past_date_note(day: date, today: date) -> str:
    """Geçmiş güne yapılan kaydın araç yanıtına eklenen notu (bugünse boş)."""
    if day == today:
        return ""
    ago = (today - day).days
    label = format_tr_date(day)
    if ago == 1:
        relative = "dün"
    else:
        # 2026-09-27 eval: "evvelsi gün" kaydında model 5/5 "dün" diyordu.
        relative = f"{ago} gün önce - 'dün' DEĞİL"
    return (
        f" Tarih: {label} ({relative}). Yanıtında kaydı '{label}' tarihine "
        "yaptığını bu tarihi yazarak söyle; 'bugün' deme."
    )
