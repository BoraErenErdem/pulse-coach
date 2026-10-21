# ABD yayını: sağlık verisi uyum dosyası (2026-10-21)

PulseCoach App Store'da Türkiye + ABD'de yayınlanıyor (AB bilerek yok - GDPR temsilcisi,
DPIA, DSA beyanı gerekir). Bu dosya ABD için yapılan araştırmanın, uygulamada nereye
karşılık geldiğinin ve süreçlerin kaydıdır. **Hukuki görüş değildir**; bir avukatın
gözden geçirmesi önerilir (aşağıda "Yapılacaklar").

## 1. Uygulanan kurallar ve neden

| Kural | Kapsam | Bizim için sonuç |
|---|---|---|
| **Washington My Health My Data Act** (RCW 19.373) | Büyüklük eşiği yok; WA'da iş yapan / WA tüketicisine hizmet veren herkes. Özel dava hakkı var (WA Consumer Protection Act). | Ayrı Tüketici Sağlık Verisi Gizlilik Politikası + ana sayfada ve uygulama içinde ayrı bağlantı, haklar, 45 gün, itiraz. |
| **Nevada SB 370** (NRS 603A, sağlık verisi bölümleri) | Eşik yok; NV'yi hedefleyen her "regulated entity". Yalnız Başsavcılık uygular. | Aynı politika + "üçüncü tarafların siteler arası toplama" beyanı + yürürlük tarihi. |
| **Connecticut Data Privacy Act** (sağlık verisi hükümleri, Public Act 23-56) | Tüketici sağlık verisi işleyen her kontrolör, eşiklerden bağımsız (2023-10-01'den beri). | İşlemeden önce açık (opt-in) rıza, çalışan/işleyen erişim kısıtı, **veri koruma değerlendirmesi** (bölüm 3). |
| **California CalOPPA** (Bus. & Prof. Code 22575) | Kaliforniyalılardan kişisel bilgi toplayan her ticari site/uygulama. | Genel gizlilik metninde Do Not Track ve üçüncü taraf takibi beyanı, değişiklik süreci, yürürlük tarihi (KVKK 1.11 + 1.12). |
| **FTC Health Breach Notification Rule** (16 CFR Part 318, 2024 değişikliği) | HIPAA dışı sağlık uygulamaları; "health care services or supplies" tanımı diyet ve fitness takibini açıkça sayıyor. | İhlal bildirimi prosedürü (bölüm 4). Temkinli yorum: kapsamdayız. |
| FTC Act md. 5 | Herkes | Politikalarda yazdığımız her şey doğru olmalı (aldatıcı beyan yasak). |

Kapsam DIŞI (kontrol edildi): HIPAA (sağlık hizmeti sağlayıcısı/sigorta değiliz); CCPA/CPRA ve
çoğu eyalet genel gizlilik yasası (gelir/kullanıcı sayısı eşikleri); Texas TDPSA ve Nebraska
(küçük işletme istisnası - yalnız hassas veri SATIŞI için rıza; satmıyoruz); New York Health
Information Privacy Act (2025-12-19 veto edildi; 2026'da yeniden sunulan A.10357/S.9269 takip
edilmeli); COPPA (18+, çocuklara yönelik değil).

## 2. Gereksinim -> uygulama eşlemesi

| Gereksinim | Nerede |
|---|---|
| Ayrı politika, yalnız yasanın istediği içerik (WA Başsavcılık SSS) | `content.py::US_HEALTH_EN/TR` -> web `/us-health-data`, mobil `app/us-health-data.tsx` |
| Ana sayfada belirgin, ayrı bağlantı (RCW 19.373.020) | Web alt bilgisi `SiteChrome.tsx` |
| Kişisel bilgi toplanan sayfalarda bağlantı (RCW 19.373.010 "homepage") | Web `/login` (giriş+kayıt) ve `/forgot-password` -> `LegalLinks.tsx`; kayıt onayı `ConsentFields.tsx` |
| Uygulama içi bağlantı (ayarlar) | Mobil Profil > Hesap ve Ayarlar, kayıt onayı `auth-ui.tsx`; web Profil > Hesap ve Ayarlar |
| İndirme sayfası (App Store) | Gizlilik URL'si `/kvkk` -> 1.12 -> politika; İngilizce açıklamanın sonunda politika adresi (`mobile/store/app-store-listing.md`) |
| Kategoriler + amaçlar, kaynaklar, paylaşılan kategoriler, üçüncü taraf/iştirak listesi | Politika 1-3 |
| Siteler arası üçüncü taraf toplama (NV), Do Not Track (CA) | Politika 4; KVKK 1.12 |
| Toplama için rıza ya da "talep edilen hizmet için gerekli" istisnası; paylaşma için ayrı rıza | Toplama hizmet için gerekli + kayıtta AYRI sağlık verisi açık rıza kutusu (CT opt-in). Paylaşma yok. |
| Rıza isteğinde: kategoriler, amaç, alıcılar, geri çekme yolu (RCW 19.373.030(3)) | KVKK bölüm 2 (açık rıza metni) + kutudaki ABD politikası bağlantısı |
| Erişim (üçüncü taraf listesi + iletişim), rıza geri çekme, silme, ayrımcılık yok | Politika 5-6; Profil > Verilerim (indirme), Profil > Hesabımı Sil |
| 45 gün + bir kez 45 gün uzatma, yılda 2 ücretsiz, kimlik doğrulama | Politika 5; prosedür bölüm 5 |
| İtiraz süreci, 45 gün, Başsavcılık şikâyet yolu | Politika 5 (WA: atg.wa.gov/file-complaint) |
| Yedeklerden silme en geç 6 ay | Yedekler 30 gün (KVKK 1.7) |
| Satış yasağı/yetki belgesi, geofence yasağı | Satış yok; konum toplanmıyor |
| Rıza sürümü | `backend/app/services/user_service.py::CONSENT_VERSION = "2.2"` |

## 3. Veri koruma değerlendirmesi (Connecticut, hassas veri işleme)

- **İşleme:** ABD'deki kullanıcıların egzersiz, beslenme (fotoğraf dahil), vücut ölçümü,
  sağlıkla ilgili profil (hedef, aktivite, kısıt/alerji, cinsiyet, doğum yılı), ruh hâli ve
  yapay zekâ sohbet verileri; bunlardan türetilen öneriler. Yalnız kullanıcının talep ettiği
  takip ve koçluk hizmeti için.
- **Faydalar:** kişiselleştirilmiş takip ve koçluk; kullanıcı verisinin üçüncü taraf yapay
  zekâ hizmetlerine gitmemesi (modeller kendi sunucumuzda).
- **Riskler:** (1) yetkisiz erişim/sızıntı - hassas sağlık verisi; (2) yapay zekânın yanlış
  ya da zararlı öneri vermesi; (3) verinin Türkiye'de saklanması (ABD kullanıcısı açısından
  yabancı yargı yetkisi); (4) e-posta yoluyla sağlık verisinin yurt dışı sağlayıcılara gitmesi.
- **Önlemler:** (1) TLS, hash'li şifre, internete kapalı veritabanı, anahtarla SSH, şifreli
  yedek, oran sınırı ve günlük kota, erişim yalnız veri sorumlusunda; (2) Kullanım
  Koşulları ve kayıt onayında tıbbi sorumluluk reddi, 18+, koç talimatlarında teşhis/ilaç
  yasağı, eval regresyon testleri; (3) politikalarda açıkça yazılı; (4) e-postalara sağlık
  verisi konmaz (yalnız şifre sıfırlama bağlantısı).
- **Sonuç:** Kalan risk, hizmetin faydası ve alınan önlemler karşısında kabul edilebilir.
  Yeni bir veri kategorisi, amaç, alıcı ya da analitik/reklam aracı eklenirse bu
  değerlendirme ve politikalar güncellenir, gerekirse rıza yeniden alınır.
- Gözden geçirme: her maddi değişiklikte ve en az yılda bir.

## 4. İhlal bildirimi prosedürü (FTC HBNR + eyalet yasaları + KVKK)

1. Şüpheli olay: erişimi kes, kayıtları koru, kapsamı belirle (hangi kullanıcılar, hangi veri,
   ne zaman). "İhlal" yetkisiz ifşayı da kapsar (ör. sağlık verisinin izinsiz paylaşılması).
2. KVKK: Kurul'a en geç 72 saat (KVKK 1.8).
3. FTC HBNR (ABD'deki etkilenenler):
   - Kişilere: gecikmeksizin ve keşiften itibaren **en geç 60 takvim günü**; e-posta + uygulama içi.
   - İçerik (16 CFR 318.6): ne oldu, ihlal ve keşif tarihleri; verinin türleri; kişinin
     alması gereken önlemler; bizim yaptıklarımız; en az iki iletişim yolu (e-posta,
     web sitesi, uygulama içi).
   - **500 ve üzeri** kişi: FTC'ye kişilere bildirimle eş zamanlı; bir eyalette 500'den fazla
     kişi: o eyaletin önde gelen medyasına da.
   - 500'den az: kayıt tut, FTC'ye yıl bitiminden sonraki 60 gün içinde toplu bildir.
   - FTC bildirim formu: ftc.gov (Health Breach Notification Rule sayfası).
4. Eyalet ihlal bildirim yasaları (ör. WA RCW 19.255): kişilere ve gerekirse eyalet
   Başsavcılığına - süreler eyalete göre değişir; olay anında kontrol edilir.

## 5. Tüketici talepleri prosedürü (WA/NV/CT)

- Kanal: uygulama içi indirme ve hesap silme; ya da kayıtlı adresten
  `destek@pulsecoachapp.com` ("Consumer Health Data Request" / "Appeal").
- Kimlik: talep kayıtlı e-postadan gelmeli; değilse ek bilgi iste. Hesabı olmayan
  kişiye "veriniz yok" yanıtı.
- Süre: alındıktan sonra **45 gün**; gerekirse bir kez +45 gün, gerekçesi ilk 45 gün içinde
  bildirilir. Yılda 2 talep ücretsiz.
- Erişim yanıtı: verilerin indirilebilir dökümü + "üçüncü taraf/iştirak listesi: yok".
- Silme: hesap silme akışı (canlı veri anında, yedek 30 gün); işleyenlere talimat.
- İtiraz: 45 gün içinde yazılı gerekçeli yanıt; red hâlinde Başsavcılık şikâyet yolu.
- Her talebi tarih, tür, yanıt tarihi ile kaydet (KVKK 1.7: en fazla 10 yıl).

## 6. Yapılacaklar (kullanıcı)

- [ ] **İşleyen sözleşmeleri:** RCW 19.373.060 ve CT, işleyenlerin yalnız bağlayıcı bir
      sözleşmeyle ve talimatla işlemesini istiyor. Cloudvist ve Uzman Posta sözleşmelerinde
      (ya da KVKK veri işleyen sözleşmelerinde) işleme talimatı, gizlilik ve silme
      hükümleri olduğunu kontrol et.
- [ ] Bu dosyayı ve `/us-health-data` metnini bir avukata gözden geçirt (özellikle WA özel
      dava hakkı nedeniyle).
- [ ] New York HIPA (A.10357/S.9269) yasalaşırsa politikayı güncelle.
- [ ] App Store Connect'te İngilizce açıklamaya politika adresini ekle (listing dosyasında hazır).
