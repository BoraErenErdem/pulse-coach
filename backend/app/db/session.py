from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

settings = get_settings()


def engine_options(database_url: str) -> dict:
    """Veritabanına göre motor ayarları (Alembic env.py de kullanır).

    Postgres (2026-09-26): tablolar saat dilimsiz `timestamp`; uygulama UTC
    yazıyor. Oturum saat dilimi sunucunun yereliyse (ör. Europe/Istanbul)
    saat bilgili UTC değerler yazılırken yerele çevriliyor ve 3 saat kayıyordu
    (Postgres'te denendi) - oturum UTC'ye sabitlenir. pool_pre_ping: barındırılan
    veritabanları boşta kalan bağlantıları kapatabiliyor."""
    if database_url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    if database_url.startswith("postgresql"):
        # Adresteki ?options=... (ör. search_path) korunur; connect_args onu ezerdi.
        existing = make_url(database_url).query.get("options") or ""
        if isinstance(existing, tuple):
            existing = " ".join(existing)
        options = f"{existing} -c timezone=UTC".strip()
        return {"connect_args": {"options": options}, "pool_pre_ping": True}
    return {}


engine = create_engine(settings.database_url, **engine_options(settings.database_url))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()