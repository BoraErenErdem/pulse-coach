from app.content.daily_tips import CATEGORY_ICONS, CATEGORY_LABELS, DAILY_TIPS, get_daily_tip

ALL_KEYS = {key for key, _tr, _en in DAILY_TIPS}
ALL_TIP_TEXTS_TR = {tr for _key, tr, _en in DAILY_TIPS}
ALL_TIP_TEXTS_EN = {en for _key, _tr, en in DAILY_TIPS}
ALL_LABELS_TR = set(CATEGORY_LABELS["tr"].values())
ALL_LABELS_EN = set(CATEGORY_LABELS["en"].values())


def test_get_daily_tip_returns_a_known_category_and_tip():
    category, tip, icon = get_daily_tip()
    assert category in ALL_LABELS_TR
    assert tip in ALL_TIP_TEXTS_TR
    assert icon


def test_get_daily_tip_covers_multiple_categories():
    # kullanıcı isteğiyle: yaşam/sağlık/ruh hali/beslenme/spor/yaşam koçluğu
    # kategorilerinin hepsi havuzda temsil edilmeli.
    expected = {"beslenme", "spor", "saglik", "ruh_hali", "yasam_koclugu", "yasam"}
    assert expected.issubset(ALL_KEYS)


def test_get_daily_tip_varies_across_many_calls():
    # rastgele seçim — çok sayıda çağrıda büyük ihtimalle birden fazla
    # farklı ipucu görülür (tek bir sabit ipucuna kilitli DEĞİL).
    seen = {get_daily_tip() for _ in range(200)}
    assert len(seen) > 1


def test_get_daily_tip_respects_language():
    """Faz 2 takip talebi: chat üstündeki ipucu banner'ı da TR/EN
    tercihine göre değişmeli."""
    for _ in range(50):
        category, tip, _icon = get_daily_tip("en")
        assert category in ALL_LABELS_EN
        assert tip in ALL_TIP_TEXTS_EN
        assert tip not in ALL_TIP_TEXTS_TR


def test_category_icons_cover_every_category_in_pool():
    for key in ALL_KEYS:
        assert key in CATEGORY_ICONS


def _register_and_login(client, email="dailytip@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_daily_tip_endpoint_returns_tip_category_and_icon(client):
    headers = _register_and_login(client)
    response = client.get("/daily-tip", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["tip"] in ALL_TIP_TEXTS_TR
    assert body["category"] in ALL_LABELS_TR


def test_daily_tip_endpoint_respects_preferred_language(client):
    """Kullanıcı preferred_language="en" ayarladıysa endpoint İngilizce
    ipucu dönmeli (Faz 2 takip talebi)."""
    headers = _register_and_login(client, email="dailytipen@example.com")
    client.patch("/profile", json={"preferred_language": "en"}, headers=headers)
    response = client.get("/daily-tip", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["tip"] in ALL_TIP_TEXTS_EN
    assert body["category"] in ALL_LABELS_EN


def test_daily_tip_endpoint_requires_authentication(client):
    response = client.get("/daily-tip")
    assert response.status_code == 401
