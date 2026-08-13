from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.checkin_message import CheckinMessage


def list_and_mark_delivered(db: Session, user_id: int) -> list[CheckinMessage]:
    """Kullanıcının check-in mesajlarını en yeniden eskiye döner, dönmeden
    ÖNCEKİ `delivered` durumunu koruyarak (frontend'de "Yeni" rozeti bunu
    kullanıyor — bkz. web/checkins/page.tsx, mobile/app/checkins.tsx). Bir
    kez döndürüldükten sonra hepsi `delivered=True` işaretlenir.

    Not (2026-08-10 mimari borç raporu, bulgu #2): bu GET endpoint'i teknik
    olarak idempotent değil (yan etkisi var) - bilerek böyle bırakıldı,
    "listeye bakınca okunmuş sayılır" ürün davranışı zaten çalışıyor ve
    kimlik doğrulamalı istekler tarayıcı/CDN tarafından spekülatif
    prefetch edilmiyor, bu yüzden pratik risk düşük. Router'daki doğrudan
    DB erişimi (asıl bulgu) bu fonksiyona taşındı."""
    messages = (
        db.query(CheckinMessage)
        .filter(CheckinMessage.user_id == user_id)
        .order_by(CheckinMessage.generated_at.desc())
        .all()
    )
    # ORM nesneleri YERİNDE mutasyona uğrayacağı için (aynı referanslar),
    # dönülecek "eski hal" (delivered=False → "Yeni" rozeti) önce ayrı
    # listelere yakalanır - aksi halde çağıran taraf zaten "hepsi okunmuş"
    # görür, rozet hiç görünmez.
    original_delivered = [m.delivered for m in messages]
    original_delivered_at = [m.delivered_at for m in messages]

    now = datetime.now(timezone.utc)
    for message in messages:
        if not message.delivered:
            message.delivered = True
            message.delivered_at = now
    db.commit()

    # Kalıcı hale getirildikten SONRA, döndürülecek nesnelerin bellek-içi
    # değerlerini eski haline geri alıyoruz (tekrar commit ETMEDEN) - router
    # bu nesneleri serialize ederken kullanıcı "Yeni" rozetini bir kez daha
    # görür, bir sonraki GET'te artık görmez.
    for message, delivered, delivered_at in zip(messages, original_delivered, original_delivered_at):
        message.delivered = delivered
        message.delivered_at = delivered_at

    return messages


def delete_checkin(db: Session, user_id: int, checkin_id: int) -> bool:
    """Tek bir bildirimi siler. Bulunamazsa (ya da başka kullanıcıya aitse)
    False döner - diğer TÜM silme endpoint'leriyle (workouts/nutrition/
    progress/exercise_goals/mood/photos) AYNI desen."""
    message = (
        db.query(CheckinMessage)
        .filter(CheckinMessage.id == checkin_id, CheckinMessage.user_id == user_id)
        .first()
    )
    if message is None:
        return False
    db.delete(message)
    db.commit()
    return True


def delete_all_checkins(db: Session, user_id: int) -> int:
    """Kullanıcının TÜM bildirimlerini siler, silinen sayıyı döner (0 dahil -
    boş listeyi silmek hata değil, no-op başarı)."""
    deleted = db.query(CheckinMessage).filter(CheckinMessage.user_id == user_id).delete()
    db.commit()
    return deleted


def mark_all_read(db: Session, user_id: int) -> int:
    """Kullanıcının TÜM okunmamış bildirimlerini `delivered=True` yapar,
    kaç tanesinin işaretlendiğini döner. `list_and_mark_delivered`'ın
    aksine (o sadece ekran açılınca örtük olarak işaretler) burası
    kullanıcının bilinçli "tümünü okundu işaretle" eylemi için."""
    now = datetime.now(timezone.utc)
    unread = (
        db.query(CheckinMessage)
        .filter(CheckinMessage.user_id == user_id, CheckinMessage.delivered.is_(False))
        .all()
    )
    for message in unread:
        message.delivered = True
        message.delivered_at = now
    db.commit()
    return len(unread)


def count_unread(db: Session, user_id: int) -> int:
    """SALT-OKUNUR okunmamış sayısı - list_and_mark_delivered()'ın AKSİNE
    çağrıldığında hiçbir satırı `delivered=True` yapmaz. Bilinçli olarak
    ayrı bir fonksiyon: NavBar/mobil menü rozeti bu sayıyı sık sık
    (poll/her render) çekiyor - list_and_mark_delivered'ı bu amaçla
    kullanmak, kullanıcı Bildirimler ekranını hiç açmadan "okunmamış"
    durumunu sessizce sıfırlardı."""
    return (
        db.query(CheckinMessage)
        .filter(CheckinMessage.user_id == user_id, CheckinMessage.delivered.is_(False))
        .count()
    )
