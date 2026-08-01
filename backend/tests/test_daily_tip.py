from app.content.daily_tips import CATEGORY_ICONS, DAILY_TIPS, get_daily_tip

ALL_TIP_TEXTS = {tip for _category, tip in DAILY_TIPS}
ALL_CATEGORIES = {category for category, _tip in DAILY_TIPS}


def test_get_daily_tip_returns_a_known_category_and_tip():
    category, tip = get_daily_tip()
    assert category in ALL_CATEGORIES
    assert tip in ALL_TIP_TEXTS


def test_get_daily_tip_covers_multiple_categories():
    # kullanıcı isteğiyle: yaşam/sağlık/ruh hali/beslenme/spor/yaşam koçluğu
    # kategorilerinin hepsi havuzda temsil edilmeli.
    expected = {"Beslenme", "Spor", "Sağlık", "Ruh Hali", "Yaşam Koçluğu", "Yaşam"}
    assert expected.issubset(ALL_CATEGORIES)


def test_get_daily_tip_varies_across_many_calls():
    # rastgele seçim — çok sayıda çağrıda büyük ihtimalle birden fazla
    # farklı ipucu görülür (tek bir sabit ipucuna kilitli DEĞİL).
    seen = {get_daily_tip() for _ in range(200)}
    assert len(seen) > 1


def test_category_icons_cover_every_category_in_pool():
    for category in ALL_CATEGORIES:
        assert category in CATEGORY_ICONS


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
    assert body["tip"] in ALL_TIP_TEXTS
    assert body["category"] in ALL_CATEGORIES
    assert body["icon"] == CATEGORY_ICONS[body["category"]]


def test_daily_tip_endpoint_requires_authentication(client):
    response = client.get("/daily-tip")
    assert response.status_code == 401
