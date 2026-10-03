from fastapi import Request
from sqlalchemy.orm import Session
from app.models.user import User
from app.services import profile_service

VALID_LANGUAGES = ("tr", "en")


def resolve_language(request: Request, db: Session, user: User | None) -> str:
    """HTTPException `detail=` mesajlarını hangi dilde döneceğimize karar
    verir (2026-08-10 pürüz taraması, Tema C — Faz 3 sohbet AI koçunu
    kapsamıştı ama REST hata mesajlarına hiç yayılmamıştı).

    Giriş yapmış kullanıcı için KALICI tercih (UserProfile.preferred_language,
    chat/mood ile AYNI kaynak — bkz. profile_service.get_language) esas
    alınır. Giriş ÖNCESİ (register/login/forgot-password/reset-password)
    henüz profil yok - istemcinin gönderdiği `X-Preferred-Language`
    header'ı (frontend'in yerel/cihaz dil tercihini taşır, backend'e hiç
    yazılmaz) kullanılır, o da yoksa/geçersizse "tr" varsayılır.

    2026-10-03: header artık giriş SONRASI da önce geliyor - ekrandaki dil
    istemcide ve her istekte header'da; profil satırı olmayan (dil hiç
    seçilmemiş, cihaz dili İngilizce) kullanıcıda ya da profil yazımı henüz
    ulaşmamışken yanıt profile göre Türkçe dönüyor, ekranla çelişiyordu
    (İngilizce arayüzde Türkçe "Your Coach's Take"). Header yoksa profil."""
    header_lang = (request.headers.get("X-Preferred-Language") or "").strip().lower()
    if header_lang in VALID_LANGUAGES:
        return header_lang
    if user is not None:
        return profile_service.get_language(db, user.id)
    return "tr"
