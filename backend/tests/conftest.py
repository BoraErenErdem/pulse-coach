import os

# Test suite'inde gerçek zamanlanmış job'ların çalışmasına gerek yok; TestClient
# context manager'ı lifespan'i (dolayısıyla scheduler start/shutdown'ı) tetikliyor,
# bunu her testte gereksiz yere yapmamak için varsayılan olarak kapatıyoruz.
os.environ.setdefault("SCHEDULER_ENABLED", "false")
# 2026-08-30 güvenlik denetimi: main.py artık app.config.Settings.jwt_secret_key
# hâlâ güvensiz varsayılanındaysa (JWT_SECRET_KEY .env'de yoksa) başlangıçta
# fail-fast oluyor (bkz. main.py::_guard_against_default_jwt_secret) - test
# suite'i gerçek bir .env'e bağımlı olmamalı, bu yüzden kendi (yalnızca test
# amaçlı, prod'daki gibi rastgele DEĞİL - sabit olması testleri deterministik
# tutuyor) anahtarını ayarlıyor.
os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-fixed-secret-not-for-real-use")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture()
def client():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
