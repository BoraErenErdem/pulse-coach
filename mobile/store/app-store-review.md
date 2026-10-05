# App Store: gizlilik etiketleri ve inceleme bilgileri

Kaynak: kod incelemesi (2026-10-03) - `backend/app/models/`, `mobile/app.json`,
`mobile/package.json`. Uygulamada reklam, analitik veya hata izleme SDK'sı yok;
yapay zekâ kendi sunucumuzda çalışıyor. Yeni bir veri alanı/SDK eklenirse bu
tablo da güncellenmeli (App Store Connect > App Privacy).

## 1. App Privacy (gizlilik etiketleri)

Durum (2026-10-03): App Store Connect'te uygulama kaydı açıldı (Apple ID
6818819139, SKU `pulsecoach-ios`, birincil dil Türkçe) ve aşağıdaki cevaplar
girildi. **Yayımlanmadı** ("Publish"): önce Privacy Policy URL'si gerekiyor,
o da web canlıya çıkınca girilecek.

**Do you or your third-party partners collect data from this app?** → Yes

Her veri türü için ortak cevaplar:
- Purpose: **App Functionality** (başka amaç yok)
- Linked to the user's identity: **Yes** (hepsi hesaba bağlı)
- Used for tracking: **No**

| App Store kategorisi | Veri türü | Uygulamadaki karşılığı |
|---|---|---|
| Contact Info | Email Address | Hesap, şifre sıfırlama e-postası |
| Contact Info | Name | Profildeki isteğe bağlı görünen ad (`display_name`) |
| Health & Fitness | Health | Kilo, bel çevresi, yağ oranı, boy, ruh hali, öğün/kalori kayıtları |
| Health & Fitness | Fitness | Antrenman setleri, kardiyo süreleri, haftalık hedefler |
| User Content | Photos or Videos | Besin analizi için gönderilen yemek fotoğrafları (12 ay / 200 adet saklanır) |
| User Content | Other User Content | Koçla sohbet mesajları, diyet kısıtları (serbest metin) |
| Identifiers | User ID | Hesap kimliği, Apple/Google giriş kimliği (`sub`) |
| Other Data | Other Data Types | Doğum yılı, cinsiyet, saat dilimi, dil tercihi |

Toplanmayanlar (işaretlenmez): Location, Financial Info, Contacts, Browsing/Search
History, Purchases, Usage Data, Diagnostics, Sensitive Info, Audio, Gameplay.
- Face ID yalnız cihazda (`expo-local-authentication`), sunucuya gitmez.
- Bildirimler cihazda yerel zamanlanır (2026-10-05): push jetonu toplanmaz, Device ID işaretlenmez.
- Saat dilimi konum sayılmaz (yalnız "bugün"ü hesaplamak için).
- Sunucu tarafı token/performans logları cihazdan toplanan veri değil.

## 2. App Review Information

- **Sign-in required:** Yes
- **Demo account:** `demo@pulsecoachapp.com` - şifre git'te YOK; sunucuda
  `DEMO_ACCOUNT_PASSWORD=... python -m scripts.create_demo_account --reset`
  ile oluşturulur (bkz. `backend/scripts/create_demo_account.py`). İncelemeye
  göndermeden hemen önce `--reset` ile tazele (son 14 günün verisi bugüne göre).
- Backend inceleme süresince açık olmalı (`/health/ready` izlemesi).

**Notes** (İngilizce, App Store Connect'e yapıştırılacak metin):

```
PulseCoach is an AI health and fitness coach. Users log workouts, meals and
body measurements by chatting with the coach or through forms; the app
summarizes progress and gives suggestions.

Demo account: the credentials above open an account with 14 days of sample
data (workouts, meals, weight, mood). Today has only breakfast logged so you
can try logging, e.g. type "I had a chicken salad for lunch" or "I did 3 sets
of 10 squats with 60 kg" in the Coach tab. The meal photo feature is on the
Nutrition tab.

AI: the language model runs on our own server; user data is not sent to any
third-party AI provider. The app is not a medical device and does not give
medical advice: users must explicitly accept, at sign-up, that the AI coach
does not replace medical advice (also stated in the Terms), and the coach is
instructed never to diagnose or prescribe.

Account deletion: Profile > Account & Settings > Delete My Account (deletes
the account and all data permanently).

Sign in with Apple is offered on iOS alongside Google sign-in. The app follows
the device language (English or Turkish).
```

## 3. Diğer App Store Connect alanları (hatırlatma)

- Privacy Policy URL: `https://pulsecoachapp.com/kvkk` (web canlı olunca)
- Age rating: sağlık/fitness içeriği, kullanıcı içeriği yok (sohbet yalnız
  yapay zekâyla); Terms 18+ diyor -> anket buna göre.
- Uygulama Türkçe+İngilizce: mağaza metni iki dilde hazırlanmalı.
