from sqlalchemy.orm import Session
from app.auth.security import hash_password
from app.models.user import User


def get_by_email(db: Session, email: str) -> User | None:
    """`auth/router.py`'nin register/login'de doğrudan yazdığı sorgu buraya
    taşındı (2026-08-10 mimari borç raporu, bulgu #3) - diğer tüm
    router'ların "DB erişimi servis üzerinden" kuralıyla tutarlı hale
    getirmek için, `password_reset_service.py`/`refresh_token_service.py`
    gibi bitişik servisler zaten vardı, sadece kullanıcı arama/oluşturma
    servisi yoktu."""
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, password: str) -> User:
    user = User(email=email, hashed_password=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
