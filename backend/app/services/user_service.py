from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.auth.security import hash_password
from app.models.user import User

# /kvkk sayfasındaki (web/mobile) metnin sürümü - schemas.user.UserCreate
# zaten kvkk_consent/health_data_consent'in True olmasını zorunlu kıldığı
# için burada SADECE hangi metne rıza verildiğini damgalıyoruz. Aydınlatma/
# açık rıza metninde MADDİ bir değişiklik yapılırsa bu sürüm artırılmalı -
# var olan kullanıcıları yeniden rızaya zorlayan bir akış henüz YOK, bu
# alan ileride öyle bir akış eklenirse "kim hangi sürüme onay verdi"
# sorusuna cevap vermek için şimdiden tutuluyor.
CONSENT_VERSION = "1.0"


def get_by_oauth_sub(db: Session, provider: str, sub: str) -> User | None:
    column = User.google_sub if provider == "google" else User.apple_sub
    return db.query(User).filter(column == sub).first()


def link_oauth_sub(db: Session, user: User, provider: str, sub: str) -> User:
    """E-postası doğrulanmış bir OAuth kimliği, AYNI e-postayla önceden
    parolayla (ya da diğer sağlayıcıyla) kayıt olmuş bir kullanıcıya
    bağlanıyor - böylece "önce e-posta/şifreyle kaydoldum, sonra Google'la
    giriş denedim" senaryosunda ikinci bir hesap AÇILMIYOR, mevcut hesaba
    bir giriş yolu daha ekleniyor."""
    if provider == "google":
        user.google_sub = sub
    else:
        user.apple_sub = sub
    db.commit()
    db.refresh(user)
    return user


def create_oauth_user(
    db: Session,
    email: str,
    provider: str,
    sub: str,
    *,
    kvkk_consent: bool,
    health_data_consent: bool,
    terms_consent: bool,
) -> User:
    """create_user'ın (parola ile kayıt) OAuth karşılığı - AYNI üç rıza
    zorunluluğu geçerli (bkz. o fonksiyondaki not), tek fark hashed_password
    yerine google_sub/apple_sub'ın doldurulması."""
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        hashed_password=None,
        google_sub=sub if provider == "google" else None,
        apple_sub=sub if provider == "apple" else None,
        kvkk_consent_at=now if kvkk_consent else None,
        health_data_consent_at=now if health_data_consent else None,
        terms_consent_at=now if terms_consent else None,
        consent_version=CONSENT_VERSION,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_by_email(db: Session, email: str) -> User | None:
    """`auth/router.py`'nin register/login'de doğrudan yazdığı sorgu buraya
    taşındı (2026-08-10 mimari borç raporu, bulgu #3) - diğer tüm
    router'ların "DB erişimi servis üzerinden" kuralıyla tutarlı hale
    getirmek için, `password_reset_service.py`/`refresh_token_service.py`
    gibi bitişik servisler zaten vardı, sadece kullanıcı arama/oluşturma
    servisi yoktu."""
    return db.query(User).filter(User.email == email).first()


def create_user(
    db: Session,
    email: str,
    password: str,
    *,
    kvkk_consent: bool,
    health_data_consent: bool,
    terms_consent: bool,
) -> User:
    # Router (schemas.user.UserCreate validator'ları) üç rızanın da True
    # olduğunu ZATEN garanti ediyor - burada tekrar dallanmıyoruz, sadece
    # rıza anının zaman damgasını basıyoruz. Aynı `now` üç alana da
    # yazılıyor (register tek bir işlem, üç ayrı checkbox aynı anda
    # onaylanıyor) - ayrı ayrı `datetime.now()` çağırmak ölçülemeyecek kadar
    # küçük ama anlamsız bir zaman farkı yaratırdı.
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        hashed_password=hash_password(password),
        kvkk_consent_at=now if kvkk_consent else None,
        health_data_consent_at=now if health_data_consent else None,
        terms_consent_at=now if terms_consent else None,
        consent_version=CONSENT_VERSION,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
