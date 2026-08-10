from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.food_catalog import FoodCatalog
from app.models.user import User
from app.services import photo_meal_service
from app.services.photo_meal_service import PhotoAnalysisError, _parse_json_items, analyze_meal_photo


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    session.add(User(email="photo@example.com", hashed_password="x"))
    session.add(
        FoodCatalog(
            fdc_id=1,
            name_en="Chicken breast, grilled",
            name_tr="Izgara tavuk göğsü",
            data_type="sr_legacy_food",
            category_tr="Kanatlı Eti Ürünleri",
            calories_kcal=165.0,
            protein_g=31.0,
            carbs_g=0.0,
            fat_g=3.6,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _fake_llm(content: str):
    return SimpleNamespace(invoke=lambda messages: SimpleNamespace(content=content))


def test_parse_json_items_extracts_plain_json_list():
    text = '[{"food_name": "Izgara tavuk göğsü", "estimated_grams": 150}]'
    assert _parse_json_items(text) == [{"food_name": "Izgara tavuk göğsü", "estimated_grams": 150}]


def test_parse_json_items_handles_markdown_fenced_json():
    text = 'İşte analiz:\n```json\n[{"food_name": "Pilav", "estimated_grams": 100}]\n```\nUmarım yardımcı olur.'
    assert _parse_json_items(text) == [{"food_name": "Pilav", "estimated_grams": 100}]


def test_parse_json_items_returns_empty_for_invalid_json():
    assert _parse_json_items("bu bir JSON değil") == []


def test_parse_json_items_logs_warning_when_no_json_found(caplog):
    """Regresyon: photo_meal_service.py hiç logging import etmiyordu - model
    bozuk/JSON-olmayan çıktı üretirse sessizce [] dönüyordu, "fotoğrafta
    yemek yok" ile ayırt edilemez şekilde (2026-08-10 pürüz taraması,
    Tema D). Bu testi yazarken ayrıca çok daha büyük bir bug ortaya çıktı:
    alembic/env.py'nin fileConfig() çağrısı TÜM app logger'larını sessizce
    devre dışı bırakıyordu (disable_existing_loggers varsayılanı True) -
    ayrıca düzeltildi, bkz. alembic/env.py."""
    with caplog.at_level("WARNING", logger="app.services.photo_meal_service"):
        _parse_json_items("bu bir JSON değil")
    assert any("JSON" in r.getMessage() and "bulunama" in r.getMessage() for r in caplog.records)


def test_parse_json_items_logs_warning_on_malformed_json(caplog):
    with caplog.at_level("WARNING", logger="app.services.photo_meal_service"):
        _parse_json_items("[{bozuk json,,, ]")
    assert any("JSON parse hata" in r.getMessage() for r in caplog.records)


def test_parse_json_items_returns_empty_for_empty_list():
    assert _parse_json_items("[]") == []


def test_analyze_meal_photo_matches_known_catalog_item(db_session, monkeypatch):
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm('[{"food_name": "ızgara tavuk göğsü", "estimated_grams": 150}]'),
    )

    items = analyze_meal_photo(db_session, b"fake-image-bytes", "image/jpeg")

    assert len(items) == 1
    assert items[0].estimated_grams == 150
    assert items[0].matched_food is not None
    assert items[0].matched_food.name_tr == "Izgara tavuk göğsü"
    assert items[0].candidates == []


def test_analyze_meal_photo_returns_candidates_for_unmatched_food(db_session, monkeypatch):
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm('[{"food_name": "Alakasız Uydurma Yemek XYZ", "estimated_grams": 200}]'),
    )

    items = analyze_meal_photo(db_session, b"fake-image-bytes", "image/jpeg")

    assert len(items) == 1
    assert items[0].matched_food is None


def test_analyze_meal_photo_propagates_is_uncertain_flag(db_session, monkeypatch):
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm(
            '[{"food_name": "ızgara tavuk göğsü", "estimated_grams": 150, "is_uncertain": true}]'
        ),
    )

    items = analyze_meal_photo(db_session, b"fake-image-bytes", "image/jpeg")

    assert len(items) == 1
    assert items[0].is_uncertain is True


def test_analyze_meal_photo_defaults_is_uncertain_to_false_when_missing(db_session, monkeypatch):
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm('[{"food_name": "ızgara tavuk göğsü", "estimated_grams": 150}]'),
    )

    items = analyze_meal_photo(db_session, b"fake-image-bytes", "image/jpeg")

    assert items[0].is_uncertain is False


def test_analyze_meal_photo_skips_items_with_missing_or_zero_grams(db_session, monkeypatch):
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm(
            '[{"food_name": "Izgara tavuk göğsü", "estimated_grams": 0}, '
            '{"food_name": "", "estimated_grams": 100}]'
        ),
    )

    items = analyze_meal_photo(db_session, b"fake-image-bytes", "image/jpeg")

    assert items == []


def test_analyze_meal_photo_rejects_oversized_image(db_session):
    too_big = b"x" * (photo_meal_service.MAX_PHOTO_BYTES + 1)
    with pytest.raises(PhotoAnalysisError):
        analyze_meal_photo(db_session, too_big, "image/jpeg")


def test_analyze_meal_photo_rejects_unsupported_mime_type(db_session):
    with pytest.raises(PhotoAnalysisError):
        analyze_meal_photo(db_session, b"abc", "application/pdf")


@pytest.mark.integration
def test_analyze_meal_photo_real_vision_call_does_not_crash(db_session):
    """Sentetik/anlamsız bir görselle bile gerçek Ollama vision çağrısının
    (base64 image_url mesaj formatı, gemma4:e4b'nin native vision desteği)
    uçtan uca çökmeden çalıştığını doğrular. Görselde gerçek bir yemek
    olmadığı için model muhtemelen boş liste dönecek — burada asıl garanti
    edilen şey plumbing'in (encode/mesaj formatı/JSON parse) çalışması,
    besin tanıma isabeti değil."""
    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (32, 32), color=(200, 120, 60)).save(buffer, format="JPEG")

    items = analyze_meal_photo(db_session, buffer.getvalue(), "image/jpeg")

    assert isinstance(items, list)


def _register_and_login(client, email="photo-api@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_photo_analyze_endpoint_requires_authentication(client):
    response = client.post(
        "/nutrition/photo-analyze", files={"file": ("meal.jpg", b"fake-bytes", "image/jpeg")}
    )
    assert response.status_code == 401


def test_photo_analyze_endpoint_rejects_unsupported_type_with_bilingual_message(client):
    """Regresyon: PhotoAnalysisError router'a hep sabit Türkçe metin
    döndürüyordu (2026-08-10 mimari borç raporu, bulgu #1)."""
    headers = _register_and_login(client, email="photo-422@example.com")
    response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.pdf", b"not-an-image", "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Desteklenmeyen dosya türü (sadece JPEG/PNG/WEBP)."

    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response_en = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.pdf", b"not-an-image", "application/pdf")},
        headers=headers,
    )
    assert response_en.status_code == 422
    assert response_en.json()["detail"] == "Unsupported file type (JPEG/PNG/WEBP only)."


def test_photo_analyze_endpoint_returns_matched_item(client, monkeypatch):
    headers = _register_and_login(client)

    from app.db.session import get_db
    from app.main import app as fastapi_app

    db_gen = fastapi_app.dependency_overrides[get_db]()
    db = next(db_gen)
    db.add(
        FoodCatalog(
            fdc_id=42,
            name_en="Rice, cooked",
            name_tr="Pirinç, pişmiş",
            data_type="sr_legacy_food",
            category_tr="Tahıllar",
            calories_kcal=130.0,
            protein_g=2.7,
            carbs_g=28.0,
            fat_g=0.3,
        )
    )
    db.commit()
    db.close()

    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm('[{"food_name": "pişmiş pirinç", "estimated_grams": 180}]'),
    )

    response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", b"fake-bytes", "image/jpeg")},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["estimated_grams"] == 180
    assert body["items"][0]["matched_food"]["name_tr"] == "Pirinç, pişmiş"
    assert body["items"][0]["is_uncertain"] is False


def test_photo_analyze_endpoint_rate_limits_after_too_many_attempts(client, monkeypatch):
    """Regresyon: /nutrition/photo-analyze her çağrıda gerçek bir vision-LLM
    isteği tetikliyor ama /chat'in aksine hiç rate limit'i yoktu (2026-08-10
    pürüz taraması, Tema D)."""
    from app.auth import rate_limit

    monkeypatch.setattr(rate_limit, "PHOTO_ANALYZE_MAX_ATTEMPTS", 2)
    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm('[{"food_name": "pişmiş pirinç", "estimated_grams": 180}]'),
    )

    headers = _register_and_login(client, email="photo-ratelimit@example.com")

    for _ in range(2):
        response = client.post(
            "/nutrition/photo-analyze",
            files={"file": ("meal.jpg", b"fake-bytes", "image/jpeg")},
            headers=headers,
        )
        assert response.status_code == 200

    locked_response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", b"fake-bytes", "image/jpeg")},
        headers=headers,
    )
    assert locked_response.status_code == 429
    assert "dakika" in locked_response.json()["detail"]


def test_photo_analyze_endpoint_returns_is_uncertain_flag(client, monkeypatch):
    headers = _register_and_login(client, email="photo-uncertain@example.com")

    monkeypatch.setattr(
        photo_meal_service,
        "get_llm",
        lambda **_kwargs: _fake_llm(
            '[{"food_name": "belirsiz bir yemek", "estimated_grams": 200, "is_uncertain": true}]'
        ),
    )

    response = client.post(
        "/nutrition/photo-analyze",
        files={"file": ("meal.jpg", b"fake-bytes", "image/jpeg")},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["is_uncertain"] is True
