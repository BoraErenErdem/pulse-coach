import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.conversation import Conversation
from app.models.user import User
from app.services import conversation_service


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="conv-service@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


def test_soft_clear_hides_history_but_keeps_rows_in_db(db_session):
    """"Sohbeti Sıfırla" geri alınabilir olmalı: list_history() (görünüm)
    sıfırlama sonrası eski mesajları GÖSTERMEMELİ ama satırlar tabloda
    fiziksel olarak KALMALI (kalıcı silmeden ayrımı, bkz. hard_delete_history
    testi altta)."""
    session, user_id = db_session
    conversation_service.save_turn(session, user_id, "eski mesaj", "eski cevap", "orchestrator")
    assert len(conversation_service.list_history(session, user_id)) == 2

    conversation_service.soft_clear(session, user_id)

    assert conversation_service.list_history(session, user_id) == []
    # Satırlar veritabanında hâlâ duruyor - service'in dışından, doğrudan
    # tabloya bakarak doğrulanıyor (list_history KASITLI OLARAK filtreli).
    raw_rows = session.query(Conversation).filter(Conversation.user_id == user_id).all()
    assert len(raw_rows) == 2


def test_soft_clear_only_hides_messages_before_the_clear_moment(db_session):
    """Sıfırlamadan SONRA atılan yeni mesajlar normal şekilde görünmeye devam
    etmeli - "sıfırla" bir kere tetiklenen an, kalıcı bir kapatma değil."""
    session, user_id = db_session
    conversation_service.save_turn(session, user_id, "eski mesaj", "eski cevap", "orchestrator")
    conversation_service.soft_clear(session, user_id)
    conversation_service.save_turn(session, user_id, "yeni mesaj", "yeni cevap", "orchestrator")

    history = conversation_service.list_history(session, user_id)
    assert [row.content for row in history] == ["yeni mesaj", "yeni cevap"]


def test_hard_delete_history_permanently_removes_rows(db_session):
    """"Sohbeti Kalıcı Olarak Sil" - soft_clear'ın aksine satırlar tablodan
    da tamamen kalkmalı."""
    session, user_id = db_session
    conversation_service.save_turn(session, user_id, "silinecek", "silinecek cevap", "orchestrator")

    conversation_service.hard_delete_history(session, user_id)

    assert conversation_service.list_history(session, user_id) == []
    raw_rows = session.query(Conversation).filter(Conversation.user_id == user_id).all()
    assert raw_rows == []


def test_hard_delete_resets_cleared_at_so_it_does_not_leak_into_future(db_session):
    """hard_delete_history sonrası chat_cleared_at NULL'a dönmeli - aksi
    halde silme sonrası atılan YENİ mesajlar (cleared_at'ten sonraki
    timestamp'leriyle) yine de görünür kalır zaten, ama bu davranışın
    kazayla bozulmadığını (alan gerçekten sıfırlanıyor mu) doğrudan
    doğruluyoruz."""
    session, user_id = db_session
    conversation_service.soft_clear(session, user_id)
    assert conversation_service.get_cleared_at(session, user_id) is not None

    conversation_service.hard_delete_history(session, user_id)

    assert conversation_service.get_cleared_at(session, user_id) is None
