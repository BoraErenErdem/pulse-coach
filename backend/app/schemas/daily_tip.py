from pydantic import BaseModel


class DailyTipRead(BaseModel):
    # Bilinçli tasarım (2026-08-08): dil seçimi backend'de YAPILMAZ, her iki
    # dilde de dönülür - frontend `language` client state'ine göre hangisini
    # göstereceğine karar verir (bkz. app/content/daily_tips.py::get_daily_tip
    # docstring'i - PATCH /profile ile GET /daily-tip arasındaki race'i önler).
    tip_tr: str
    tip_en: str
    category_tr: str
    category_en: str
    icon: str
