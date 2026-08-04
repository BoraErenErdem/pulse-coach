from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, defer
from app.models.meal_photo import MealPhoto


def save_meal_photo(
    db: Session, user_id: int, image_bytes: bytes, mime_type: str, detected_food_names: list[str]
) -> MealPhoto:
    """Analiz edilen bir fotoğrafı kalıcı olarak kaydeder - foto analiz
    edildiği HER seferde çağrılır (kullanıcı sonuçtan hiçbir besin
    kaydetmese bile), çünkü tek tek loglanan besinlerle fotoğraf arasında
    ayrı bir bağ kurmak (hangi log hangi fotoğraftan geldi) gereksiz bir
    karmaşıklık olurdu - galeri "analiz ettiğim fotoğraflar" anlamına
    geliyor, "logladığım besinlerin kaynağı" değil."""
    photo = MealPhoto(
        user_id=user_id,
        image_data=image_bytes,
        mime_type=mime_type,
        detected_items_summary=", ".join(detected_food_names),
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


def list_meal_photos(db: Session, user_id: int, limit: int = 30) -> list[MealPhoto]:
    """Galeri listesi için metadata döner - image_data BLOB'u `defer` ile
    sorgudan hariç tutuluyor (listelemede potansiyel olarak MB'larca veriyi
    gereksiz çekmemek için); tek bir fotoğraf açıldığında get_meal_photo ile
    tam satır (image_data dahil) ayrıca çekiliyor."""
    return (
        db.query(MealPhoto)
        .options(defer(MealPhoto.image_data))
        .filter(MealPhoto.user_id == user_id)
        .order_by(MealPhoto.created_at.desc())
        .limit(limit)
        .all()
    )


def get_meal_photo(db: Session, user_id: int, photo_id: int) -> MealPhoto | None:
    return db.query(MealPhoto).filter(MealPhoto.id == photo_id, MealPhoto.user_id == user_id).first()


def delete_meal_photo(db: Session, user_id: int, photo_id: int) -> bool:
    photo = get_meal_photo(db, user_id, photo_id)
    if photo is None:
        return False
    db.delete(photo)
    db.commit()
    return True


def _stale_photo_ids_for_user(db: Session, user_id: int, retention_count: int, cutoff) -> set[int]:
    older_than_cutoff = {
        row[0]
        for row in db.query(MealPhoto.id)
        .filter(MealPhoto.user_id == user_id, MealPhoto.created_at < cutoff)
        .all()
    }
    beyond_count = {
        row[0]
        for row in db.query(MealPhoto.id)
        .filter(MealPhoto.user_id == user_id)
        .order_by(MealPhoto.created_at.desc())
        .offset(retention_count)
        .all()
    }
    return older_than_cutoff | beyond_count


def cleanup_old_meal_photos(db: Session, retention_count: int, retention_months: int) -> int:
    """Kullanıcı başına foto galerisini sınırlar - hem `retention_months`'tan
    eski hem de kullanıcı başına en yeni `retention_count`'u aşan fotoğraflar
    silinir (iki sınır da bağımsız uygulanır, hangisi önce tetiklenirse). Ay,
    basitlik için 30 gün olarak yaklaşıklanıyor - proje ek bir tarih
    kütüphanesine (dateutil vb.) bağımlı değil, bkz. requirements.txt."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=retention_months * 30)

    user_ids = [row[0] for row in db.query(MealPhoto.user_id).distinct().all()]
    stale_ids: set[int] = set()
    for user_id in user_ids:
        stale_ids |= _stale_photo_ids_for_user(db, user_id, retention_count, cutoff)

    if not stale_ids:
        return 0
    db.query(MealPhoto).filter(MealPhoto.id.in_(stale_ids)).delete(synchronize_session=False)
    db.commit()
    return len(stale_ids)
