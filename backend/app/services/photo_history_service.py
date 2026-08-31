import io
import logging
from datetime import datetime, timedelta, timezone

from PIL import Image
from sqlalchemy.orm import Session, defer
from app.models.meal_photo import MealPhoto

logger = logging.getLogger(__name__)

# 2026-08-31 kullanıcı kararı: fotoğraflar hiç küçültülmeden/sıkıştırılmadan
# BLOB olarak saklanıyordu - `backup_service.py` her yedekte DB'nin TAMAMINI
# (bu BLOB'lar dahil) kopyalıyor, `backup_max_to_keep` kadar nüsha tutuyor;
# retention politikası (bkz. cleanup_old_meal_photos, kullanıcı başına en
# fazla `meal_photo_retention_count` foto) sadece FOTOĞRAF SAYISINI
# sınırlıyordu, TEK TEK fotoğrafın boyutunu değil - ham bir telefon fotoğrafı
# (mobil sadece quality:0.7 JPEG uyguluyor, web hiç sıkıştırmıyor) birkaç MB
# olabiliyordu. Analiz ve galeri önizlemesi için bu çözünürlük hiç gerekmiyor.
# Sadece SAKLAMA aşamasında (analiz için gönderilen ham baytlara DOKUNULMUYOR,
# bkz. photo_meal_service.py) uzun kenarı bu boyuta indirilip JPEG'e
# yeniden kodlanıyor.
_MAX_STORED_DIMENSION_PX = 1024
_STORED_JPEG_QUALITY = 78


def _compress_for_storage(image_bytes: bytes, mime_type: str) -> tuple[bytes, str]:
    """Saklamadan önce görüntüyü küçültüp JPEG'e yeniden kodlar - tipik bir
    telefon fotoğrafını (birkaç MB) genelde birkaç yüz KB'a indirir. Pillow
    görüntüyü açamazsa (bozuk/geçersiz veri - ör. testlerdeki sahte
    baytlar, ya da gerçekten bozuk bir yükleme) İSTİSNA FIRLATMAZ, orijinal
    baytları/mime_type'ı olduğu gibi döner - bu adımın başarısız olması
    fotoğrafın hiç kaydedilememesine yol AÇMAMALI, sadece sıkıştırma
    faydasından mahrum kalır."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.load()  # decode'u burada zorla - hatalar try/except içinde yakalanır
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                # JPEG saydamlığı desteklemiyor - saydam alanları beyaz zemine
                # composite et (PNG ekran görüntüsü gibi nadir bir girdi
                # olsa da sessizce siyaha/rastgele bir renge dönüşmesin).
                rgba = img.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.split()[-1])
                img = background
            else:
                img = img.convert("RGB")

            width, height = img.size
            longest_side = max(width, height)
            if longest_side > _MAX_STORED_DIMENSION_PX:
                scale = _MAX_STORED_DIMENSION_PX / longest_side
                new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
                img = img.resize(new_size, Image.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=_STORED_JPEG_QUALITY, optimize=True)
            return buffer.getvalue(), "image/jpeg"
    except Exception:
        logger.warning(
            "photo_history_service: fotoğraf sıkıştırılamadı (Pillow açamadı), "
            "orijinal bayt dizisi olduğu gibi saklanıyor",
            exc_info=True,
        )
        return image_bytes, mime_type


def save_meal_photo(
    db: Session, user_id: int, image_bytes: bytes, mime_type: str, detected_food_names: list[str]
) -> MealPhoto:
    """Analiz edilen bir fotoğrafı kalıcı olarak kaydeder - foto analiz
    edildiği HER seferde çağrılır (kullanıcı sonuçtan hiçbir besin
    kaydetmese bile), çünkü tek tek loglanan besinlerle fotoğraf arasında
    ayrı bir bağ kurmak (hangi log hangi fotoğraftan geldi) gereksiz bir
    karmaşıklık olurdu - galeri "analiz ettiğim fotoğraflar" anlamına
    geliyor, "logladığım besinlerin kaynağı" değil.

    Saklanan bayt dizisi `_compress_for_storage` ile küçültülür - ANALİZE
    (photo_meal_service.analyze_meal_photo) gönderilen ORİJİNAL bayt
    dizisinden farklıdır, bilerek: analiz kalitesini hiç etkilememek için
    LLM'e her zaman ham görüntü gönderiliyor, sadece kalıcı depoya giden
    kopya küçültülüyor."""
    stored_bytes, stored_mime_type = _compress_for_storage(image_bytes, mime_type)
    photo = MealPhoto(
        user_id=user_id,
        image_data=stored_bytes,
        mime_type=stored_mime_type,
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
