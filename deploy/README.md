# PulseCoach canlı ortam (Cloudvist GPU VM)

Backend, web arayüzü, Postgres, Ollama ve zamanlayıcı **tek bir GPU sunucusunda**
(Cloudvist GPU VM-1, RTX A5000 24 GB, Ubuntu, Türkiye) çalışır. Dışarıya yalnız Caddy
açıktır (80/443); sertifikayı Let's Encrypt'ten kendisi alır. Cloudflare **yalnız DNS**
olarak kullanılır (gri bulut): trafik Cloudflare'den geçmez, veri Türkiye'den çıkmaz.

```
kullanıcı ─► sunucu :443 (Caddy, HTTPS)
               ├─ pulsecoach-webapp  next start :3000         pulsecoachapp.com (+ www)
               ├─ pulsecoach-api     uvicorn :8000 (2 süreç)  api.pulsecoachapp.com
               ├─ pulsecoach-worker  python -m app.worker  (hatırlatmalar, gece yedeği)
               ├─ postgresql@17-main :5432 (yalnız 127.0.0.1)
               └─ pulsecoach-ollama  :11434 (yalnız 127.0.0.1)
```

Süreçler **systemd birimi**dir (`deploy/cloudvist/systemd/`): sunucu yeniden başlayınca
kendiliğinden kalkar. Uygulama root değil `pulsecoach` kullanıcısıyla çalışır; kod ve
`.env` root'undur, süreçler yalnız `/srv/pulsecoach/data` ve `/srv/pulsecoach/backups`'a
yazabilir.

| Yol | İçerik |
|---|---|
| `/srv/pulsecoach/pulse-coach` | depo (`.env` burada, `root:pulsecoach` 640) |
| `/srv/pulsecoach/opt`, `venv` | uv, Python 3.13, Ollama, Node, rclone |
| `/srv/pulsecoach/data` | Ollama modelleri, gömme önbellekleri |
| `/srv/pulsecoach/backups` | yerel yedekler (son 14) |
| `/srv/pulsecoach/secrets` | `rclone.conf` |

`setup.sh`, GitHub Actions'ta gerçek bir Ubuntu 24.04 VM'inde (systemd var, GPU yok) iki
kez çalıştırılıp Caddy üzerinden kayıt/giriş, web sayfaları, yeniden başlatma, yedek ve
geri yükleme ile doğrulanır (`.github/workflows/deploy-smoke.yml`). **NVIDIA sürücü adımı
orada denenemez** - ilk kez gerçek sunucuda çalışır (aşağıda "NVIDIA sürücüsü").

## İlk kurulum

1. **Teslim kontrolü** (iade yok - önce bunu yap). Sunucuya SSH ile bağlan:
   ```bash
   lspci | grep -i nvidia        # RTX A5000 görünmeli
   lsb_release -ds; nproc; free -g; df -h /
   ```
   Kart A5000 değilse ya da hiç görünmüyorsa kurulumdan önce Cloudvist'e yaz. Disk en az
   **80 GB** boş olmalı (modeller ~18 GB, Node/Python/sürücü, veri ve yedekler).
2. **SSH'ı anahtarla sınırla** (parolayla giriş internete açık kalmasın). Kendi
   bilgisayarından anahtarı gönder, girişi dene, sonra sunucuda parolayı kapat:
   ```bash
   printf 'PasswordAuthentication no\n' > /etc/ssh/sshd_config.d/00-pulsecoach.conf
   systemctl reload ssh
   ```
   İkinci bir terminalden anahtarla girebildiğini görmeden ilk oturumu kapatma.
3. **DNS** (Cloudflare → DNS → Records). Üçü de **DNS only** (gri bulut), değer sunucunun
   sabit IPv4'ü. Mevcut MX/TXT (e-posta) kayıtlarına dokunma.

   | Tür | Ad | Değer |
   |---|---|---|
   | A | `@` | `<SUNUCU_IP>` |
   | A | `www` | `<SUNUCU_IP>` |
   | A | `api` | `<SUNUCU_IP>` |

   Kayıtlar yayılmadan Let's Encrypt sertifika vermez; Caddy kendiliğinden yeniden dener.
4. Depoyu al:
   ```bash
   mkdir -p /srv/pulsecoach
   git clone https://github.com/BoraErenErdem/pulse-coach /srv/pulsecoach/pulse-coach
   ```
5. **Katalog dosyası** (kullanıcı verisi içermez; besin kataloğunun kaynağı git'te değil).
   Kendi bilgisayarında, `backend/` içinde:
   ```bash
   python -m scripts.export_catalog_snapshot --source sqlite:///./health_coach.db --output catalog_snapshot.db
   scp catalog_snapshot.db root@<SUNUCU_IP>:/srv/pulsecoach/catalog_snapshot.db
   ```
6. `bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/setup.sh` çalıştır. İlk çalıştırma
   NVIDIA sürücüsünü kurar ve büyük olasılıkla **"sunucuyu yeniden başlat"** diyerek
   durur: `reboot`, yeniden bağlan, aynı komutu tekrar çalıştır. Betik
   `/srv/pulsecoach/pulse-coach/.env`'i `deploy/env.production.example`'dan oluşturur,
   `JWT_SECRET_KEY` ve veritabanı parolasını **kendisi üretir**. Modelleri çekmek
   (~18 GB) bağlantıya göre 20-40 dakika sürer.
7. `.env`'de şunları doldur, sonra `setup.sh`'i tekrar çalıştır:
   `SMTP_*` (aşağıda kontrol listesi), `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` /
   `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `BACKUP_RCLONE_REMOTE` (aşağıda).
8. Kontrol:
   ```bash
   curl -s 127.0.0.1:8000/health/ready        # {"status":"ok",...}
   curl -s https://api.pulsecoachapp.com/health
   /srv/pulsecoach/opt/ollama/bin/ollama ps   # ilk sohbetten sonra: modeller "100% GPU"
   ```
   İstemci IP'si doğru geliyor mu: yanlış şifreyle bir giriş dene,
   `rate_limit_attempts` tablosunda `login_ip` satırında kendi genel IP'n görünmeli
   (127.0.0.1 görünüyorsa IP bazlı limitler herkes için ortak olur).

## NVIDIA sürücüsü

Sürücüyü `setup.sh` kurar: `ubuntu-drivers install --gpgpu` (Ubuntu'nun önerdiği imzalı
sunucu sürücüsü) + aynı daldan `nvidia-utils` (`nvidia-smi`). CUDA araç takımı gerekmez:
Ollama kendi CUDA kitaplıklarıyla gelir. Modüller açılışta yüklenir
(`/etc/modules-load.d/pulsecoach-nvidia.conf`).

- **"Sürücü kuruldu ama henüz yüklenemedi":** beklenen durum (açık kaynak `nouveau`
  sürücüsü yüklüyken NVIDIA modülü yüklenemez). `reboot`, sonra `setup.sh`.
- **`ubuntu-drivers` bir şey kurmadıysa** (özel çekirdek, hazır modül yok): DKMS'li paketi
  elle kur, yeniden başlat, `setup.sh`'i tekrar çalıştır:
  ```bash
  ubuntu-drivers list --gpgpu
  apt-get install -y nvidia-driver-<SÜRÜM>-server && reboot
  ```
- **Modeller CPU'da çalışıyorsa** (`ollama ps` "100% GPU" demiyor, yanıtlar çok yavaş):
  `nvidia-smi` çalışıyor mu bak; "Driver/library version mismatch" diyorsa `reboot`.
  `journalctl -u pulsecoach-ollama -n 100 --no-pager` GPU'yu bulup bulmadığını yazar.

## Yedekleme

- Worker her gece `BACKUP_HOUR`'da (UTC; 0 = Türkiye 03:00) `pg_dump --format=custom`
  alır, `/srv/pulsecoach/backups`'ta son 14'ü tutar. `setup.sh` her güncellemeden önce ve
  sonra da yedek alır.
- **Sunucu dışı kopya Türkiye'de kalmalı** (KVKK metni: "Türkiye'deki ayrı yedekte 30
  gün"). Sunucunun diski varsayılan olarak yedeklenmiyor; disk giderse yerel yedekler de
  gider. İki yol:
  1. **Kendi bilgisayarına çekmek** (ek maliyet yok). Windows Görev Zamanlayıcı ile günde
     bir kez:
     ```powershell
     scp -p "root@<SUNUCU_IP>:/srv/pulsecoach/backups/*.dump" D:\pulsecoach-yedek\
     Get-ChildItem D:\pulsecoach-yedek\*.dump | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
     ```
     Dosyalar şifresiz sağlık verisidir: klasör BitLocker'lı bir diskte durmalı.
  2. **Türkiye'de bir SFTP hedefine itmek** (`BACKUP_RCLONE_REMOTE`): her yedek rclone ile
     oraya da kopyalanır, 30 günden eskileri silinir. rclone **crypt** ile dosyalar
     sunucudan çıkmadan şifrelenir, hedef içeriği göremez:
     ```bash
     export RCLONE_CONFIG=/srv/pulsecoach/secrets/rclone.conf
     /srv/pulsecoach/opt/bin/rclone config create yedek sftp host=<HEDEF> user=<KULLANICI> \
         key_file=/srv/pulsecoach/secrets/yedek_ed25519
     /srv/pulsecoach/opt/bin/rclone config create pulsecoach-crypt crypt \
         remote=yedek:pulsecoach-backups password="$(/srv/pulsecoach/opt/bin/rclone obscure '<UZUN_PAROLA>')"
     bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/setup.sh   # dosya izinlerini düzeltir
     ```
     `.env`: `BACKUP_RCLONE_REMOTE=pulsecoach-crypt:db`. Anahtar dosyası `root:pulsecoach`
     640 olmalı. **Crypt parolasını ayrıca bir parola yöneticisinde sakla** - sunucu
     kaybolursa yedekler ancak onunla açılır.
- `/health/ready`, en yeni yerel yedek `HEALTH_MAX_BACKUP_AGE_HOURS`'tan (36) eskiyse 503
  döner: duran yedekleme uptime izleyicisinden alarm olarak gelir.
- **Geri yükleme** (yerelde 2026-09-30'da prova edildi: 292 kullanıcı, tüm tablolar birebir):
  ```bash
  systemctl stop pulsecoach-api pulsecoach-worker
  export PGPASSWORD="$(grep -E '^DATABASE_URL=' /srv/pulsecoach/pulse-coach/.env | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#')"
  /usr/lib/postgresql/17/bin/pg_restore --clean --if-exists --no-owner \
      -h 127.0.0.1 -U pulsecoach -d pulsecoach /srv/pulsecoach/backups/<dosya>.dump
  bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/setup.sh
  ```

## Güncelleme ve yeniden başlatma

```bash
cd /srv/pulsecoach/pulse-coach && git pull --ff-only
bash deploy/cloudvist/setup.sh
```
Betik idempotent: önce yedek alır, `scripts.release` ile migration + katalog
güncellemelerini + gömme önbelleğini uygular, web'i gerekirse yeniden derler, süreçleri
yeniden başlatır. Sunucu yeniden başladığında betiğe gerek yoktur; birimler kendisi kalkar.

```bash
systemctl status 'pulsecoach-*' caddy --no-pager      # durum
journalctl -u pulsecoach-api -f                       # canlı log
journalctl -u pulsecoach-worker --since today
```

**Loglar 14 gün tutulur** (KVKK metnindeki süre): journal günlük dosyalara bölünür ve 14
günden eskisi silinir (`/etc/systemd/journald.conf.d/pulsecoach.conf`); Caddy'nin erişim
kaydı `/var/log/caddy/access.log` da 14 gün (Caddyfile). Şifre sıfırlama bağlantısındaki
belirteç ve `Authorization` başlığı erişim kaydına yazılmaz.

**Veritabanına bakmak** (DBeaver vb.): Postgres yalnız 127.0.0.1'i dinler; istemcide SSH
tüneli kullan (SSH: sunucu IP'si/root, veritabanı: `127.0.0.1:5432`, kullanıcı ve parola
`.env`'deki `DATABASE_URL`'den).

### Sistem güncellemesi

Güvenlik güncellemeleri kendiliğinden kurulur (Ubuntu `unattended-upgrades`), **çekirdek
ve NVIDIA paketleri hariç** (`/etc/apt/apt.conf.d/52pulsecoach-hold-gpu`): sürücü
kitaplığı yüklü modülden yeni olursa GPU yeniden başlatmaya kadar kaybolur ve modeller
sessizce CPU'ya düşer. Bunları ayda bir, sakin bir saatte elle güncelle:
```bash
apt-get update && apt-get full-upgrade -y && reboot
# yeniden bağlanınca:
nvidia-smi && bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/setup.sh
```
`nvidia-smi` çalışmıyorsa `setup.sh` yeni çekirdeğe uyan modülü kurar.

## İzleme

Ücretsiz bir uptime servisi (UptimeRobot, Better Stack) ile
`https://api.pulsecoachapp.com/health/ready`'yi 5 dakikada bir yokla, 503/erişilemezlikte
e-posta alarmı kur. Yanıt yalnız `ok`/`degraded` ve kontrol adlarını içerir; kişisel veri
yoktur. Kontroller: veritabanı, Ollama + üç model, yedek tazeliği. (İzleyici yurt dışından
yalnız bu adresi yoklar; kullanıcı verisi görmez.)

## Ollama ayarı

Canlı ayar (`deploy/cloudvist/systemd/pulsecoach-ollama.service` + `.env`):
`OLLAMA_NUM_PARALLEL=4`, `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`,
`OLLAMA_MAX_LOADED_MODELS=3`, `LLM_NUM_CTX=32768`, `LLM_KEEP_ALIVE=24h`.

**Gerçek istem boyutu** (2026-09-30, `chat_regression` 41 senaryo, 87 model çağrısı; uygulama
artık her çağrıyı `app.llm.usage` logger'ına yazar): sistem istemi + araç şemaları tek başına
~11.8k token. İstem medyanı 11.9k, p90 12.5k, en büyük 16.1k; çıktı (düşünme dahil) en fazla
2.9k. Yani 20000'lik bağlam düşürülemez, payı ~%20. İstem bağlamın %80'ini geçerse log
WARNING yazar (Ollama taşan istemi sessizce baştan kırpar).

**Bellek ve hız** (RTX 4080 Laptop 12 GB, Ollama 0.30.8, paralel=4, model tek başına yüklü,
~10.6k token istem; VRAM = `nvidia-smi` farkı, `/api/ps` e4b'yi eksik gösteriyor):

| Ayar | e4b VRAM | e4b istem / üretim | 12b VRAM (GPU'da) | 12b istem / üretim |
|---|---|---|---|---|
| f16, FA kapalı, ctx 20000 | 6.5 GB | 3.8-4.5k / 73 tok/s | 10.7 GB (%70 GPU) | 0.8k / 14 tok/s |
| q8_0, FA açık, ctx 20000 | 5.6 GB | 5.7-6.1k / 68 tok/s | 9.4 GB (%100) | 2.6k / 40 tok/s |
| q8_0, FA açık, ctx 32768 | 5.9 GB | 6.3k / 78 tok/s | 9.9 GB (%100) | 2.6k / 41 tok/s |

A5000'de (24 GB) üç model birlikte ~16.3 GB (+ nomic ~0.5 GB): rahat sığar.
Kalite: q8_0 + 32768 ile `chat_regression --trials 1` 41/41 (aynı gün f16/20000 tabanı 40/41;
tek hata bilinen `strength_plus_cardio`). Sunucuda `ollama ps` ile modellerin `100% GPU`
olduğunu doğrula.

## Günlük kota

`CHAT_DAILY_LIMIT` (100) / `PHOTO_DAILY_LIMIT` (20): kullanıcının yerel gece yarısında
yenilenir, 0 = sınırsız. Mobil ve web, hak 10'un (fotoğrafta 5'in) altına inince kalan
hakkı gösterir; dolunca 429 ile TR/EN mesaj döner.

## Mobil uygulama

Mağaza derlemesi canlı API'yi kullanmalı:
```bash
cd mobile
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.pulsecoachapp.com
eas build --profile production --platform all
```

### Kapalı beta (mağaza öncesi)

- **Android:** `eas submit -p android --profile production` derlemeyi Play Console'da
  **Internal testing** kanalına *taslak* olarak yükler (`eas.json` → `track: internal`;
  yayınlanmamış uygulamaya Play yalnız taslak kabul ediyor). Play Console'da test
  kullanıcılarının e-postalarını ekleyip sürümü yayınla. İlk gönderimde Google Play servis
  hesabı anahtarı istenir.
- **iOS:** `eas submit -p ios --profile production` → TestFlight; iç test kullanıcıları
  (App Store Connect ekibi) inceleme beklemeden dener, harici test ilk sürümde kısa bir
  Beta App Review'dan geçer.
- Beta başlamadan: `/health/ready` izlemesi, SMTP (şifre sıfırlama) ve sunucu dışı yedek hazır olsun.
- **Geri bildirimden eval senaryosu:** beta kullanıcılarının mesajlarını `eval/` altına ham
  haliyle kopyalama (özel nitelikli sağlık verisi, repo herkese açık). Hatalı davranışı aynı
  kalıpta ama uydurma değerlerle yeniden yaz; test kullanıcılarına mesajlarının hata ayıklama
  için okunabileceğini baştan söyle.

## Yayın öncesi kontrol listesi (kod dışı)

- [ ] **Barındırma Cloudvist (karar 2026-10-05):** KVKK ve yasal metinler (web `src/app/kvkk`,
      `src/app/terms`, mobil `app/kvkk.tsx`, `app/terms.tsx`; kaynak `tools/legal_texts/`) bu düzene
      göre yazıldı - aşağıdakilerin HEPSİ canlıda gerçekten böyle olmalı, yoksa metin yanlış olur:
  - [x] Cloudvist'ten **yazılı** teyit: kart RTX A5000 24 GB, veri **Türkiye'de kalır**
        (sözleşme md. 22'ye rağmen), sabit IP, KVKK md. 12 veri işleyen taahhüdü (2026-10-12).
        Teslimde kartı yine de `lspci` / `nvidia-smi` ile doğrula.
  - [ ] Ağ: Cloudflare yalnız **DNS** (gri bulut, proxy kapalı) + sunucuda Caddy/Let's Encrypt;
        Cloudflare Tunnel KULLANILMAZ (trafik yurt dışından geçmesin). `setup.sh` kurar;
        canlıda A kayıtlarının gri bulut olduğunu gör.
  - [ ] Yedek: sunucu dışı kopya **Türkiye'de** (yukarıda "Yedekleme": kendi bilgisayarına
        çekmek ya da TR'de SFTP + rclone **crypt**); R2 KULLANILMAZ. Bir kez geri yükleme denendi.
  - [x] E-posta: Uzman Posta (Kurumsal E-Posta, EKO 5 GB, aylık; veri Türkiye'de) -
        `destek@pulsecoachapp.com` hem gönderici hem iletişim/KVKK başvuru kutusu, Gmail'e
        YÖNLENDİRİLMEZ (webmail / iPhone Mail ile okunur). `SMTP_HOST=mail.uzmanposta.com`,
        `SMTP_PORT=587` (STARTTLS), `SMTP_USERNAME`/`SMTP_FROM_EMAIL=destek@pulsecoachapp.com`.
        Cloudflare DNS: MX `mx.uzmanposta.com` (10), SPF `v=spf1 mx include:_spf.uzmanposta.com -all`,
        DKIM `default._domainkey`, DMARC `p=none`. Gmail'de SPF/DKIM/DMARC PASS, şifre sıfırlama
        uçtan uca denendi (2026-10-05). Gönderim sınırı 100/saat, 1.000/gün.
  - [ ] DMARC'ı birkaç hafta rapor izledikten sonra `p=quarantine`'e çek.
  - [x] Uzman Posta yurt dışı çıkış röleleri (mxlayer.com Dallas, OVH Paris, mxlt.net
        Lüksemburg) sorusu yanıtlandı, sorun yok (2026-10-12).
  - [x] Apple Private Email Relay'e YENİ göndericiyi kaydet (Apple Developer → Services →
        *Sign in with Apple for Email Communication*): `destek@pulsecoachapp.com` e-posta adresi
        olarak kayıtlı, SPF yeşil; eski `pulsecoach26@gmail.com` kaldırıldı (2026-10-05). Gönderici
        adres değişirse yenisi de buraya kaydedilmeli.
  - [x] Push KALDIRILDI (2026-10-05): bildirimler cihazda yerel zamanlanıyor, sunucu Expo'ya
        bir şey göndermiyor -> yurt dışı aktarım yok, KVKK md. 9 standart sözleşme/Kurul bildirimi
        gerekmiyor. Metinden "Yurt dışı" paragrafı çıktı (CONSENT_VERSION 2.1).
  - [ ] Sunucu erişim logları **14 gün** - metin bunu söylüyor. `setup.sh` kurar (journal +
        Caddy); canlıda `journalctl --disk-usage` ve `ls /var/log/caddy` ile bak.
  - [x] KVKK avukatı son okuması yapıldı, sorun yok (2026-10-12).
- [ ] Google ile giriş (web): Google Cloud Console → OAuth web istemcisi → *Authorized
      JavaScript origins*'e `https://pulsecoachapp.com` ekle.
- [ ] Uptime izleyici `https://api.pulsecoachapp.com/health/ready` (5 dk, e-posta alarmı).
- [ ] rclone crypt parolası parola yöneticisinde (SFTP yedeği kullanılıyorsa).
- [ ] Mağaza kaydı: gizlilik politikası URL'si `https://pulsecoachapp.com/kvkk`, koşullar
      `https://pulsecoachapp.com/terms`.
- [ ] Sentry henüz yok (KVKK metni + DSN gerekir); hata takibi şimdilik `journalctl`.
