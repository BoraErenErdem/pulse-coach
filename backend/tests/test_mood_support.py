import pytest

from app.agents.mood_support_agent import CRISIS_RESPONSE, check_crisis_indicators


def _register_and_login(client, email="mood@example.com", password="supersecret"):
    client.post("/auth/register", json={"email": email, "password": password})
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "message",
    [
        # Kendine zarar verme / intihar düşüncesi
        "Artık kendime zarar vermeyi düşünüyorum",
        "Bazen intihar etmeyi düşünüyorum",
        "Canıma kıymak istiyorum",
        "Yaşamak istemiyorum artık",
        "Yaşamayı istemiyorum artık",
        "Ölmek istiyorum",
        "Ölmeyi istiyorum",
        "olmeyi dusunuyorum bazen",  # aksansız yazım
        "Keşke bir daha uyanmak istemiyorum",
        "Ölsem daha iyi olur herkes için",
        "Hayatıma son vermek istiyorum",
        "Hayatıma son vereceğim",
        "Hayata veda ediyorum artık",
        "Yaşamanın hiçbir anlamı yok bence",
        "Artık dayanamıyorum, bitti",
        "Bileğimi kesmek istiyorum şu an",
        "Bileğimi kestim biraz önce",
        "Kendimi öldürmek istiyorum",
        "Kendimi kesiyorum bazen rahatlamak için",
        "Kendimi keseceğim bu gece",
        # Büyük harf / cümle başı "İ" edge-case (bilinen Python .lower() tuzağı)
        "İntihar etmeyi düşünüyorum",
        "İNTİHAR EDECEĞİM artık dayanamıyorum",
        "İçimden kendime zarar vermek geliyor",
        # Uzun süreli çökkünlük
        "Aylardır kendimi kötü hissediyorum, hiçbir şeyden zevk almıyorum",
        "Sürekli değersiz hissediyorum kendimi",
        "Haftalardır depresyondayım, çıkamıyorum bu halden",
        "Yaşamaktan yoruldum artık",
        "Yaşamaktan bıktım resmen",
        "Günlerdir yataktan çıkamıyorum",
        "Hiçbir şeye anlam veremiyorum artık",
        # Yeme bozukluğu belirtileri
        "Kendimi kusturuyorum yemek yedikten sonra",
        "Kendimi kusturdum yine bu akşam",
        "Günlerdir hiçbir şey yemedim",
        "Kendimi aç bırakıyorum kilo vermek için",
        "Yemek yemeyi reddediyorum günlerdir",
        "Yemek yemekten korkuyorum artık",
        # Noktalama/satır sonu/fazla boşluk ile bölünmüş ifadeler — basit
        # alt-dize eşleşmesi bunları kaçırıyordu, normalize() artık harf
        # olmayan her şeyi boşluğa indirgiyor
        "Kendimi, öldürmek istiyorum.",
        "Kendimi\nöldürmek istiyorum",
        "Kendimi   öldürmek istiyorum",
        # Konu ile fiil arasına doğal dolgu kelimesi giren ifadeler (en fazla
        # 2 kelime) — regex tabanlı _CRISIS_REGEXES ile yakalanmalı
        "Kendimi artık öldürmek istiyorum",
        "Kendime cidden zarar vermek istiyorum",
        "Canıma gerçekten kıymak istiyorum",
        "Hayatıma artık son vermek istiyorum",
        "Ölmek çok istiyorum",
        "Yaşamak hiç istemiyorum",
        "Bileğimi gerçekten kesmek istiyorum",
        "Kendimi tamamen aç bırakıyorum",
        "Yemek yemekten gerçekten korkuyorum",
        "Yemek yemeyi tamamen reddediyorum",
        # Uzun süreli çökkünlük / yeme bozukluğu ifadelerine de aynı dolgu
        # kelimesi toleransı — bunlar önceden sabit cümle olarak tanımlıydı
        # ve "artık"/"çok" gibi çok yaygın dolgu kelimeleriyle kırılıyordu
        "Hiçbir şeyden artık zevk almıyorum",
        "Aylardır resmen kendimi kötü hissediyorum",
        "Sürekli çok değersiz hissediyorum",
        "Artık gerçekten dayanamıyorum",
        "Yaşamanın artık hiçbir anlamı yok",
        "Günlerdir resmen yataktan çıkamıyorum",
        "Günlerdir hakikaten hiçbir şey yemedim",
        "Ölsem gerçekten daha iyi olur",
        "Bir daha hiç uyanmak istemiyorum",
    ],
)
def test_check_crisis_indicators_detects_crisis_signals(message):
    assert check_crisis_indicators(message) is True


@pytest.mark.parametrize(
    "message",
    [
        # Normal koçluk sohbeti
        "Bugün antrenmanı atladım, kendimi biraz kötü hissediyorum",
        "Bu hafta hiç motivasyonum yok",
        "Diyetimden saptım, tatlı yedim",
        "Bugün 78 kilo geldim",
        "Squat yaparken dizim ağrıyor mu diye merak ediyorum",
        "Yorgunum ama devam edeceğim",
        "Kilo vermek istiyorum, hedefim bu",
        "Formda olmak istiyorum yaz için",
        "Sağlıklı olmak istiyorum artık",
        # "kendimi kes-" kökünün genişletilmesiyle daha önce yanlışlıkla
        # tetiklenen (ş->s, iyelik eki normalizasyonu sonrası "kes" ile
        # başlayan) zararsız/pozitif cümleler — regresyon testi
        "Kendimi keşfetmek istiyorum bu süreçte",
        "Kendimi kesinlikle daha iyi hissediyorum bugün",
        "Antrenmandan sonra kendimi keşfetmek istiyorum, güzel bir yolculuk",
        "Kendimi tamamen kesinlikle daha iyi geliştirmek istiyorum",
        "Kendimi bu ay gerçekten çok daha iyi geliştirmek istiyorum, motivasyonum yüksek",
        "Kendime iyi bakmak istiyorum, kendime zaman ayırmak istiyorum",
        # Uzun/pozitif mesajlarda gap-toleranslı regex'lerin alakasız
        # kelimeleri birbirine bağlayıp yanlış tetiklememesi gerekiyor
        "Bu hafta diyetimi tamamen değiştirdim, artık çok daha sağlıklı "
        "besleniyorum ve kendimi harika hissediyorum",
        "Yemek yapmayı çok seviyorum, özellikle akşamları mutfakta vakit "
        "geçirmek beni mutlu ediyor",
        "Kendimi geliştirmek için her gün kitap okuyorum, hayatıma yeni bir "
        "alışkanlık kattım",
        "Bugün antrenmanda kendimi çok iyi hissettim, yeni bir rekor kırdım",
        "Uzun zamandır kendimi bu kadar enerjik hissetmiyordum, teşekkürler koçum",
        "Canım sıkkın bugün ama yarın toparlanırım",
    ],
)
def test_check_crisis_indicators_does_not_flag_normal_messages(message):
    assert check_crisis_indicators(message) is False


@pytest.mark.integration
def test_chat_crisis_message_returns_fixed_template_without_llm(client):
    headers = _register_and_login(client)

    response = client.post(
        "/chat",
        json={"message": "Artık yaşamak istemiyorum, kendime zarar vermeyi düşünüyorum."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent_used"] == "mood_support_agent"
    assert body["reply"] == CRISIS_RESPONSE
    assert "112" in body["reply"]

    history_response = client.get("/chat/history", headers=headers)
    history = history_response.json()
    assert len(history) == 2
    assert history[1]["content"] == CRISIS_RESPONSE


@pytest.mark.integration
def test_chat_crisis_message_with_capital_i_still_bypasses_llm(client):
    """Regresyon testi: Türkçe büyük 'İ' harfinin str.lower() ile beklenmedik
    normalize olması yüzünden cümle başı büyük yazılan kriz ifadeleri
    (ör. 'İntihar...') daha önce hiç yakalanmıyordu."""
    headers = _register_and_login(client, email="mood_capital@example.com")

    response = client.post(
        "/chat",
        json={"message": "İntihar etmeyi düşünüyorum, artık dayanamıyorum."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent_used"] == "mood_support_agent"
    assert body["reply"] == CRISIS_RESPONSE


@pytest.mark.integration
def test_chat_crisis_message_with_filler_word_still_bypasses_llm(client):
    """Regresyon testi: konu (kendimi/canima/...) ile fiil kökü arasına doğal
    dolgu kelimesi ('artık' gibi) girdiğinde de tespit bozulmamalı."""
    headers = _register_and_login(client, email="mood_gap@example.com")

    response = client.post(
        "/chat",
        json={"message": "Kendimi artık öldürmek istiyorum."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent_used"] == "mood_support_agent"
    assert body["reply"] == CRISIS_RESPONSE


@pytest.mark.integration
def test_chat_mild_mood_message_uses_mood_support_agent(client):
    headers = _register_and_login(client, email="mood2@example.com")

    response = client.post(
        "/chat",
        json={"message": "Bugün kendimi çok kötü hissediyorum, hiç motivasyonum kalmadı."},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "mood_support_agent" in body["agent_used"]
    assert body["reply"] != CRISIS_RESPONSE
    assert isinstance(body["reply"], str) and body["reply"].strip() != ""
