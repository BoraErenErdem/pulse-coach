import logging
import requests
from sqlalchemy.orm import Session
from app.models.user import User

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_REQUEST_TIMEOUT_SECONDS = 10


def set_push_token(db: Session, user: User, expo_push_token: str | None) -> None:
    """POST /users/me/push-token'ın çağırdığı tek satırlık ata+commit -
    last-device-wins (tek kolon, çoklu cihaz senaryosu şimdilik gerekmiyor).
    None geçilirse (kullanıcı bildirimleri kapattığında) token temizlenir."""
    user.expo_push_token = expo_push_token
    db.commit()


def send_push_notification(
    db: Session, user: User, title: str, body: str, data: dict | None = None
) -> None:
    """email_service._send_email'deki dev-mode-no-op deseninin push
    karşılığı: token yoksa (kullanıcı hiç kaydolmamış ya da bildirimleri
    kapatmış) sessizce log'a yazıp döner. HER ZAMAN best-effort çağrılır
    (PR/hedef/haftalık/günlük bildirim kancalarından) - bu yüzden ASLA
    exception fırlatmaz, çağıranın asıl işlemini (set kaydı, check-in
    oluşturma) bozmamalıdır."""
    if not user.expo_push_token:
        logger.info("[Push - token yok] %s: %s", title, body)
        return

    try:
        response = requests.post(
            EXPO_PUSH_URL,
            json={
                "to": user.expo_push_token,
                "title": title,
                "body": body,
                "sound": "default",
                "data": data or {},
            },
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        result = response.json()
    except Exception:
        logger.exception("Push bildirimi gönderilemedi (user_id=%s)", user.id)
        return

    # Expo tek bir push isteği için ["data"]["status"] alanında "ok"/"error"
    # döner (batch API olduğu için normalde liste bekler ama tek alıcı
    # gönderiminde tekil dict de dönebilir - ikisini de ele alıyoruz).
    ticket = result.get("data")
    if isinstance(ticket, list):
        ticket = ticket[0] if ticket else None
    if not isinstance(ticket, dict):
        return

    if ticket.get("status") == "error" and ticket.get("details", {}).get("error") == "DeviceNotRegistered":
        # Cihaz artık geçersiz (uygulama silinmiş/token yenilenmiş) - token'ı
        # temizleyip bir daha bu kullanıcıya boşuna deneme yapılmasını önlüyoruz.
        logger.info("Expo token geçersiz (DeviceNotRegistered), temizleniyor (user_id=%s)", user.id)
        user.expo_push_token = None
        db.commit()
