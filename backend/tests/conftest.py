import os

# Test suite'inde gerçek zamanlanmış job'ların çalışmasına gerek yok; TestClient
# context manager'ı lifespan'i (dolayısıyla scheduler start/shutdown'ı) tetikliyor,
# bunu her testte gereksiz yere yapmamak için varsayılan olarak kapatıyoruz.
os.environ.setdefault("SCHEDULER_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import rate_limit
from app.db.base import Base
from app.db.session import get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(autouse=True)
def _reset_rate_limit_state():
    # rate_limit._attempts modül-seviyesinde, DB'nin aksine testler arası
    # SIFIRLANMIYOR - özellikle IP bazlı register limiti (TestClient'ın
    # sahte IP'si tüm testlerde aynı) sıfırlanmazsa testler birbirini
    # kilitleyebilir.
    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


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
