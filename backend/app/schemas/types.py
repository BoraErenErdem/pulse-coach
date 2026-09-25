"""Yanıt şemalarında ortak alan tipleri."""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator


def _assume_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


# Modeller zaman damgalarını `datetime.now(timezone.utc)` ile yazıyor ama SQLite
# saat dilimini saklamadığı için geri okunan değer "naive" - JSON'a eksiz
# ("2026-09-22T15:02:10") çıkıyor ve istemciler bunu YEREL saat sanıyordu
# (Türkiye'de bildirim saatleri 3 saat erken, 00:00-03:00 arası çekilen yemek
# fotoğrafı bir önceki günde görünüyordu - 2026-09-25). Naive değer UTC kabul
# edilip "Z" ekiyle serileştirilir; istemcide `new Date()` doğru yerel saati verir.
UtcDateTime = Annotated[datetime, AfterValidator(_assume_utc)]
