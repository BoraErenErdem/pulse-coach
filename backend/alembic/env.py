from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# app/ paketini import edebilmek için (prepend_sys_path=. zaten backend/'i
# ekliyor - bu import'lar app.config ve app.models'in Python path'inde
# bulunmasına güveniyor, alembic komutları backend/ dizininden çalıştırılmalı,
# tıpkı `uvicorn app.main:app` gibi - bkz. README.md "Çalıştırma" bölümü).
import app.models  # noqa: F401 - Base.metadata'ya tüm modelleri kaydettirmek için
from app.config import get_settings
from app.db.base import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# alembic.ini'deki sqlalchemy.url yerine, uygulamanın kendi Settings'inden
# (aynı DATABASE_URL .env değişkeni) okunuyor - tek bir yerden yönetiliyor,
# alembic.ini'yi elle güncel tutmaya gerek kalmıyor.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
#
# KRİTİK (2026-08-10 pürüz taraması, Tema D'de bir logging testi yazarken
# tesadüfen bulundu): fileConfig()'in varsayılanı disable_existing_loggers=
# True - main.py'nin _run_migrations() çağrısı (uygulama HER açılışında,
# hem prod hem test) bu env.py'yi tetikliyor ve o ana kadar import edilmiş
# TÜM logger'ları (routers/services zaten import edilmiş oluyor, sadece
# migration'dan SONRA loglama yapanlar hariç TÜM app logger'ları) sessizce
# devre dışı bırakıyordu. Bu, 2026-08-03/04'te "main.py'de hiç
# logging.basicConfig yoktu, TÜM logger.info() çağrıları sessizce
# kayboluyordu" diye bulunup düzeltilen bug'ı, Alembic'e geçişle (2026-08-04)
# FARKLI bir mekanizmadan AYNEN GERİ GETİRMİŞ - logging.basicConfig() hâlâ
# çalışıyordu (root'a handler ekliyordu) ama child logger'ların .disabled
# bayrağı True olduğu için Logger.handle() hiç callHandlers'a ulaşmıyordu.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
