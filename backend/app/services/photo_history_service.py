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
