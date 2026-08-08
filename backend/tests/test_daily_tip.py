from app.content.daily_tips import CATEGORY_ICONS, CATEGORY_LABELS, DAILY_TIPS, get_daily_tip

ALL_KEYS = {key for key, _tr, _en in DAILY_TIPS}
ALL_TIP_TEXTS_TR = {tr for _key, tr, _en in DAILY_TIPS}
ALL_TIP_TEXTS_EN = {en for _key, _tr, en in DAILY_TIPS}
ALL_LABELS_TR = set(CATEGORY_LABELS["tr"].values())
ALL_LABELS_EN = set(CATEGORY_LABELS["en"].values())


def test_get_daily_tip_returns_matching_tr_en_pair_and_icon():
    """Bilingual tasarım (2026-08-08, race condition fix'i): tek çağrı HEM
    tr HEM en metni birlikte döner, dil seçimi backend'de yapılmaz."""
    tip = get_daily_tip()
    assert tip.category_tr in ALL_LABELS_TR
    assert tip.category_en in ALL_LABELS_EN
    assert tip.tip_tr in ALL_TIP_TEXTS_TR
    assert tip.tip_en in ALL_TIP_TEXTS_EN
    assert tip.icon
    # tr/en metinleri AYNI havuz elemanına ait olmalı (birbirinden bağımsız
    # rastgele seçilmiş olmamalı).
    matching = [(key, tr, en) for key, tr, en in DAILY_TIPS if tr == tip.tip_tr]
    assert len(matching) == 1
    assert matching[0][2] == tip.tip_en


def test_get_daily_tip_covers_multiple_categories():
    # kullanıcı isteğiyle: yaşam/sağlık/ruh hali/beslenme/spor/yaşam koçluğu
    # kategorilerinin hepsi havuzda temsil edilmeli.
    expected = {"beslenme", "spor", "saglik", "ruh_hali", "yasam_koclugu", "yasam"}
    assert expected.issubset(ALL_KEYS)


def test_get_daily_tip_varies_across_many_calls():
    # rastgele seçim — çok sayıda çağrıda büyük ihtimalle birden fazla
    # farklı ipucu görülür (tek bir sabit ipucuna kilitli DEĞİL).
    seen = {get_daily_tip().tip_tr for _ in range(200)}
    assert len(seen) > 1


def test_category_icons_cover_every_category_in_pool():
    for key in ALL_KEYS:
        assert key in CATEGORY_ICONS


def _register_and_login(client, email="dailytip@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_daily_tip_endpoint_returns_bilingual_tip_category_and_icon(client):
    headers = _register_and_login(client)
    response = client.get("/daily-tip", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["tip_tr"] in ALL_TIP_TEXTS_TR
    assert body["tip_en"] in ALL_TIP_TEXTS_EN
    assert body["category_tr"] in ALL_LABELS_TR
    assert body["category_en"] in ALL_LABELS_EN
    assert body["icon"]


def test_daily_tip_endpoint_requires_authentication(client):
    response = client.get("/daily-tip")
    assert response.status_code == 401
