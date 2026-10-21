# App Store: mağaza metinleri (TR / EN)

Hazırlandı: 2026-10-14, metinler 2026-10-16'da yeniden yazıldı. Kaynak: tanıtım sayfasının metinleri (`web/src/components/landing/`)
ve uygulamanın bugünkü hâli; uygulamada olmayan bir şey vaat edilmez. Karakter sınırları
App Store Connect'inkiler; sayılar bu dosyadaki metinlerin gerçek uzunluğu. Gizlilik
etiketleri ve inceleme notu: `app-store-review.md`.

## Ortak alanlar

| Alan | Değer |
|---|---|
| Birincil kategori | Health & Fitness |
| İkincil kategori | Food & Drink |
| Destek URL'si | `https://pulsecoachapp.com` (SSS + `destek@pulsecoachapp.com`) |
| Pazarlama URL'si | `https://pulsecoachapp.com` |
| Gizlilik politikası URL'si | `https://pulsecoachapp.com/kvkk` |
| İngilizce (U.S./U.K.) URL'ler | Gizlilik `https://pulsecoachapp.com/kvkk?lang=en`, destek ve pazarlama `https://pulsecoachapp.com/?lang=en` (2026-10-21: `/` ve `/kvkk` dil seçimi yoksa Türkçe açılıyor - Google dizini için; `?lang=en` İngilizce açar ve saklar) |
| ABD sağlık verisi politikası | `https://pulsecoachapp.com/us-health-data` (Washington MHMDA; İngilizce açıklamanın sonunda da var) |
| Telif | `2026 Bora Eren Erdem` |
| Fiyat | Ücretsiz (uygulama içi satın alma yok) |
| Cihaz | Yalnız iPhone (`supportsTablet: false`, 2026-10-14): iPad ekran görüntüsü gerekmez |

## Türkçe (birincil dil)

**Ad** (30, 30): `PulseCoach: Sağlık & Spor Koçu`

**Alt başlık** (30, 30): `Yapay zeka, beslenme, ruh hali` (şapkasız: aramada yaygın yazım)

Ad 2026-10-21'de kelimeli yapıldı (kullanıcı kararı): App Store aramasında en ağır alan ad;
marka henüz aranmıyor ve "PulseCoach: Running Coach" (ABD, İngilizce koşu uygulaması) ile
karışmasın. Telefondaki ikon adı yine `PulseCoach` (app.json) - yeni build gerekmez.
"Yaşam koçu" bilerek yok: uygulama yaşam koçluğu yapmıyor (Apple 2.3.7, doğru metadata).

**Tanıtım metni** (170, 165; yayından sonra da güncellenebilir):
```
Ne yediğini ve nasıl çalıştığını yazman yeterli: PulseCoach bunu öğüne, antrenmana ve ilerleme grafiğine dönüştürür. Tabağının fotoğrafından kaloriyi de tahmin eder.
```

**Anahtar kelimeler** (100, 98; virgülle, boşluksuz; ad ve alt başlıktaki kelimeler tekrar edilmez):
```
kalori,diyet,antrenman,fitness,kilo,makro,protein,öğün,egzersiz,takip,kardiyo,yemek,koç,kas,günlük
```

**Açıklama** (4000, 2404):
```
PulseCoach, beslenme ve antrenman takibini bir sohbet kadar kolaylaştıran, yapay zekâ destekli kişisel sağlık koçudur. Ne yediğini ve nasıl çalıştığını kendi cümlelerinle anlatırsın; PulseCoach kayıtları oluşturur, ilerlemeni izler ve bir sonraki adımını önerir.

SOHBETLE KAYIT
"Öğlen 150 g ızgara tavuk ve bulgur pilavı yedim, akşam 30 dakika yürüdüm" yazman yeterli. Koçun öğünü ve antrenmanı kaydeder, kaloriyi ve makroları hesaplar. Form kullanmayı tercih edersen Beslenme, Antrenman ve İlerleme ekranlarından da kayıt ekleyebilirsin.

FOTOĞRAFLA ÖĞÜN
Tabağının fotoğrafını çek ya da galeriden seç. PulseCoach besinleri tanır, porsiyonları tahmin eder, kaloriyi ve makroları gösterir. Gramajı düzeltebilir, besini değiştirebilir ya da çıkarabilirsin; sen onaylamadan hiçbir şey kaydedilmez.

BESLENME
• Türk mutfağı dahil 7.900'den fazla besin
• Öğün öğün günlük özet ve 7, 14 ve 30 günlük kalori trendi
• Boyuna, yaşına, aktivite düzeyine ve hedefine göre günlük kalori önerisi
• Protein, karbonhidrat ve yağ hedefleri

ANTRENMAN
• Kuvvet ve kardiyo dahil 890'dan fazla egzersiz
• Her egzersiz için en iyi set, gelişim grafiği ve rekor bildirimi
• Haftada kaç gün çalışacağını belirlediğin haftalık hedef

İLERLEME VE MOTİVASYON
• Kilo, bel çevresi ve yağ oranı hedefleri; haftalık içgörüler ve aylık trendler
• Ruh hali takvimi: günü tek dokunuşla işaretle, antrenmanlarınla ilişkisini gör
• Seri, dokuz rozet ve tüm hedeflerini tek ekranda toplayan Hedef Merkezi
• Her pazar koçundan haftalık değerlendirme ve öneri
• Yalnızca gerektiğinde, seçtiğin saatte gelen hatırlatmalar

TÜRKÇE VE İNGİLİZCE
Arayüz de koçun yanıtları da Türkçe ya da İngilizce. Açık ve koyu tema desteklenir.

GİZLİLİK
• Verilerin Türkiye'deki sunucularda saklanır. Yapay zekâ kendi sunucumuzda çalışır; verilerin üçüncü taraf yapay zekâ hizmetlerine gönderilmez.
• Reklam yoktur. Verilerin satılmaz ve yapay zekâ eğitiminde kullanılmaz.
• Tüm verilerini dilediğin zaman indirebilir, hesabını kalıcı olarak silebilirsin.
• Face ID ile uygulama kilidi

ÜCRETSİZ
PulseCoach ücretsizdir ve uygulama içi satın alma içermez. Adil kullanım için yapay zekâ koçunda günlük mesaj sınırı vardır. Aynı hesapla pulsecoachapp.com üzerinden web'de de giriş yapabilirsin.

Önemli: PulseCoach tıbbi bir cihaz değildir ve tıbbi tavsiyenin yerini tutmaz; tanı koymaz, tedavi önermez. Bir sağlık sorunun varsa bir sağlık profesyoneline danış.
```

## English

**Name** (30, 28): `PulseCoach: Health & Fitness`

**Subtitle** (30, 27): `AI nutrition & mood tracker`

**Promotional text** (170, 167; can be updated after release):
```
Just tell your coach what you ate and how you trained. PulseCoach turns it into meals, workouts and progress charts, and estimates calories from a photo of your plate.
```

**Keywords** (100, 95; comma-separated, no spaces; words in the name and subtitle are not repeated):
```
counter,diet,workout,gym,weight,macro,protein,meal,exercise,cardio,food,log,calorie,coach,sport
```

**Description** (4000, 2494):
```
PulseCoach is an AI-powered personal health coach that makes tracking your meals and workouts as easy as having a conversation. Describe what you ate and how you trained in your own words; PulseCoach creates the logs, follows your progress and suggests your next step.

LOG BY CHATTING
Just write "I had 150 g grilled chicken and bulgur pilaf for lunch and walked for 30 minutes this evening." Your coach logs the meal and the workout and calculates the calories and macros. Prefer forms? You can also add entries from the Nutrition, Workouts and Progress screens.

MEALS FROM A PHOTO
Take a photo of your plate or pick one from your gallery. PulseCoach recognizes the foods, estimates the portions and shows the calories and macros. Adjust the grams, swap a food or remove it; nothing is saved until you confirm.

NUTRITION
• Over 7,900 foods, including Turkish cuisine
• A meal-by-meal daily summary and 7, 14 and 30-day calorie trends
• A daily calorie target based on your height, age, activity level and goal
• Protein, carb and fat goals

WORKOUTS
• Over 890 exercises, including strength and cardio
• Your best set, a progress chart and record alerts for every exercise
• A weekly goal for how many days you want to train

PROGRESS AND MOTIVATION
• Weight, waist and body fat goals, with weekly insights and monthly trends
• Mood calendar: mark your day in one tap and see how it relates to your training
• Streaks, nine badges and the Goal Center, which brings all your goals together
• A weekly review and recommendation from your coach every Sunday
• Reminders only when needed, at the time you choose

ENGLISH AND TURKISH
Both the app and your coach's replies are available in English or Turkish, in light and dark themes.

PRIVACY
• Your data is stored on servers in Turkey. The AI runs on our own server; your data is never sent to third-party AI services.
• No ads. Your data is never sold or used to train AI.
• Download all your data or permanently delete your account at any time.
• App lock with Face ID
• U.S. residents: our Consumer Health Data Privacy Policy is at pulsecoachapp.com/us-health-data

FREE
PulseCoach is free and has no in-app purchases. The AI coach has a daily message limit for fair use. You can also sign in on the web at pulsecoachapp.com with the same account.

Important: PulseCoach is not a medical device and is not a substitute for medical advice; it does not diagnose or prescribe. If you have a health condition, consult a healthcare professional.
```

## Ekran görüntüleri

Tasarımlı görsel (2026-10-16, kullanıcı kararı): üstte kısa başlık + alt metin, altta
çerçeveli telefonda uygulama ekranı, kenardan taşan tek bilgi kartı; sekmenin kimlik
rengiyle parıltı, Outfit 800 başlık + Inter (tanıtım sayfasının dili). Açık ve koyu sürüm
üretilir; **mağazaya KOYU set yüklenir** (kullanıcı kararı 2026-10-16) - App Store dil
başına tek set alır, koyu tema için ayrı yuva yoktur.

Dosyalar `screenshots/` altında:

- `slides.js`: 6 slaytın TR/EN başlık, alt metin ve kart metinleri, açık/koyu kimlik rengi, kart konumu.
- `template.html`: tek slayt (440x956 CSS px, `theme=light|dark`).
- `capture.mjs`: ham ekranları uygulamanın Expo web önizlemesinden çeker ->
  `raw/<tema>/<dil>/<id>.png` (414x896 pt, 3x = 1242x2688; iPhone 11 ile aynı oran; git dışı, ~19 MB).
- `render.mjs`: her slayt x dil x tema için 1320x2868 PNG (6.9" iPhone, opak RGB) ->
  `out/<dil>/<tema>/` + `out/onizleme-<dil>-<tema>.png` (out git dışı). Başlık alana
  sığmazsa hata verir. `raw/` dosyası olmayan slayt tanıtım sayfasının eski ekranıyla
  `-TASLAK` adıyla üretilir - bunlar mağazaya YÜKLENMEZ.

Sıra (ilk üçü arama sonucunda görünür): 1 Sohbet, 2 Fotoğraf analizi, 3 Beslenme,
4 Antrenman, 5 İlerleme, 6 Profil (seri, rozetler).

Ham ekranları yenileme (uygulama arayüzü değişirse; ilk çekim 2026-10-16):
1. backend (8000), `npx expo start` (8081) ve Ollama (`gemma4:e4b` sohbet, `gemma4:12b` fotoğraf) açık.
2. `backend/` dizininden iki geçici hesap (aynı şifre):
   `DEMO_ACCOUNT_PASSWORD=<şifre> python -m scripts.create_demo_account --email store-tr@pulsecoachapp.com --language tr --reset`
   (ve `store-en@...` için `--language en`). Kayıt adları hesabın diliyle yazıldığı için iki hesap gerekir.
3. Her hesapta `PATCH /profile {"display_name": "Elif"}` ve tek sohbet turu (`POST /chat`):
   - TR: `Bugün öğlen 150 g ızgara tavuk ve 200 g bulgur pilavı yedim, akşam 30 dakika tempolu yürüdüm. Nasıl gidiyorum?`
   - EN: `Today I had 150 g grilled chicken and 200 g bulgur pilaf for lunch, and walked briskly for 30 minutes this evening. How am I doing?`
   Yanıtın öğünü ve yürüyüşü kaydettiğini kontrol et (sohbet kartı bunu söylüyor).
4. Repo kökünden `STORE_PASSWORD=<şifre> node mobile/store/screenshots/capture.mjs`
   (`--only <id>`, `--lang tr`, `--theme dark` ile daraltılabilir). Fotoğraf ekranı
   `.playwright-mcp/meal.jpg` (kullanıcının izinli fotoğrafı) ile gerçek analiz yapar.
5. `node mobile/store/screenshots/render.mjs`, önizlemeleri kontrol et.
6. İki geçici hesabı sil.

Notlar: web önizlemesinde iPhone durum çubuğu yok (çerçeveli tasarımda sorun değil);
emojiler Windows'un emoji yazı tipiyle çizilir.
