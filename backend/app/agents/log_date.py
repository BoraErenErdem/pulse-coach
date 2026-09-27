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


def relative_day_hint(message: str, today: date) -> str | None:
    """Mesajdaki TEK göreli günü ("dün", "evvelsi gün", "3 gün önce") koda
    çözdürüp modele somut tarih olarak verir. 2026-09-27 eval: model "evvelsi
    gün" kaydını çoğu kez doğru güne yazıp yanıtta yine "dün" diyordu, bir kez
    de 1 gün önceye yazdı. Birden fazla/aralık dışı gün varsa ipucu verilmez."""
    text = tr_lower(message)
    days: set[int] = set()
    for pattern, to_days in _RELATIVE_DAY_PATTERNS:
        for match in pattern.finditer(text):
            days.add(to_days(match))
        text = pattern.sub(" ", text)
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


def resolve_log_date(db: Session, user_id: int, days_ago: int | None) -> date | str:
    """Kaydın tarihi ya da (kaydedilmemesi gerekiyorsa) "Kaydedilmedi" ile
    başlayan bir mesaj - orkestratör bu öneki başarısız kayıt sayar."""
    today = user_today(db, user_id)
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
