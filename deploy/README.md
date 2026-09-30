# PulseCoach canlı ortam (RunPod)

Backend, web arayüzü, Postgres, Ollama ve zamanlayıcı **tek bir RunPod GPU pod'unda**
çalışır; dış dünyaya yalnız Cloudflare Tunnel açılır.

```
kullanıcı ─► Cloudflare ─► (Tunnel) ─► pod
                                        ├─ web      uvicorn :8000 (2 süreç)  api.pulsecoachapp.com
                                        ├─ webapp   next start :3000         pulsecoachapp.com
                                        ├─ worker   python -m app.worker  (hatırlatmalar, gece yedeği)
                                        ├─ postgres :5432 (yalnız 127.0.0.1)
                                        └─ ollama   :11434 (yalnız 127.0.0.1)
```

**Neden Docker compose değil:** RunPod pod'u zaten bir container; içinde Docker/compose
çalışmıyor. Süreçleri `supervisord` yönetir (`deploy/runpod/supervisord.conf`).
Pod durdurulup açılınca container diski sıfırlanır, **yalnız `/workspace` kalır**: Python,
Ollama, Node, cloudflared, rclone, modeller ve veritabanı oradadır; apt paketleri
(Postgres 17, supervisor) her açılışta `setup.sh` tarafından yeniden kurulur.

**Community Cloud uyarısı:** network volume yalnız Secure Cloud'da var. Community pod'un
makinesi giderse `/workspace` de gider → pod dışı şifreli yedek (aşağıda) zorunludur.

`setup.sh`, GitHub Actions'ta düz bir Ubuntu 24.04 container'ında (root, systemd yok)
iki kez çalıştırılıp kayıt/giriş, web sayfaları, yedek ve geri yükleme ile doğrulanır
(`.github/workflows/deploy-smoke.yml`).

## İlk kurulum

1. **Pod:** RTX A5000 (24 GB), Ubuntu 22.04/24.04 tabanlı bir CUDA şablonu (ör. RunPod
   PyTorch). Volume disk **en az 60 GB** (modeller ~18 GB, Node/Python/veri), container
   disk 20 GB. Port açmaya gerek yok (tünel dışarıya kendisi bağlanır).
2. Pod terminalinde:
   ```bash
   git clone https://github.com/BoraErenErdem/pulse-coach /workspace/pulse-coach
   ```
3. **Katalog dosyası** (kullanıcı verisi içermez; besin kataloğunun kaynağı git'te değil).
   Kendi bilgisayarında, `backend/` içinde:
   ```bash
   python -m scripts.export_catalog_snapshot --source sqlite:///./health_coach.db --output catalog_snapshot.db
   ```
   Dosyayı pod'a `/workspace/catalog_snapshot.db` olarak gönder (RunPod web arayüzündeki
   dosya yükleme, `runpodctl send catalog_snapshot.db` ya da `scp`).
4. `bash /workspace/pulse-coach/deploy/runpod/setup.sh` çalıştır. İlk çalıştırma
   `/workspace/pulse-coach/.env`'i `deploy/env.production.example`'dan oluşturur,
   `JWT_SECRET_KEY` ve veritabanı parolasını **kendisi üretir**.
5. `.env`'de şunları doldur, sonra `setup.sh`'i tekrar çalıştır:
   `CLOUDFLARE_TUNNEL_TOKEN` (aşağıda), `SMTP_*` (şifre sıfırlama e-postası),
   `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` / `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
   `BACKUP_RCLONE_REMOTE` (aşağıda).
6. Kontrol: `curl -s 127.0.0.1:8000/health/ready` → `{"status":"ok",...}`.

## Cloudflare Tunnel

Cloudflare paneli → Zero Trust → Networks → Tunnels → *Create a tunnel* (Cloudflared).
Verilen belirteci `.env`'de `CLOUDFLARE_TUNNEL_TOKEN=` satırına yaz. *Public hostnames*:

| Alan adı | Hizmet |
|---|---|
| `pulsecoachapp.com` | `HTTP` → `127.0.0.1:3000` |
| `api.pulsecoachapp.com` | `HTTP` → `127.0.0.1:8000` |

**`localhost` değil `127.0.0.1` yaz.** uvicorn yalnız 127.0.0.1'den gelen
`X-Forwarded-For` başlığına güvenir; tünel `localhost` üzerinden IPv6 `::1`'e bağlanırsa
tüm kullanıcılar aynı IP'den geliyor görünür ve IP bazlı giriş/kayıt limitleri herkes
için ortak olur. Doğrulama: yanlış şifreyle bir giriş dene,
`rate_limit_attempts` tablosunda `login_ip` satırında kendi genel IP'n görünmeli.

## Yedekleme

- Worker her gece `BACKUP_HOUR`'da (UTC; 0 = Türkiye 03:00) `pg_dump --format=custom`
  alır, `/workspace/backups`'ta son 14'ü tutar. `setup.sh` her güncellemeden önce ve
  sonra da yedek alır.
- **Pod dışı kopya:** `BACKUP_RCLONE_REMOTE` ayarlıysa her yedek rclone ile oraya da
  kopyalanır, 30 günden eskileri silinir. Önerilen: Cloudflare R2 (10 GB'a kadar ücretsiz)
  üzerinde rclone **crypt** remote'u - dosyalar pod'dan çıkmadan şifrelenir, Cloudflare
  içeriği göremez.
  ```bash
  export RCLONE_CONFIG=/workspace/secrets/rclone.conf
  /workspace/opt/bin/rclone config create r2 s3 provider=Cloudflare \
      access_key_id=<R2_KEY_ID> secret_access_key=<R2_SECRET> \
      endpoint=https://<HESAP_ID>.r2.cloudflarestorage.com
  /workspace/opt/bin/rclone config create pulsecoach-crypt crypt \
      remote=r2:pulsecoach-backups password="$(/workspace/opt/bin/rclone obscure '<UZUN_PAROLA>')"
  chmod 600 /workspace/secrets/rclone.conf
  ```
  `.env`: `BACKUP_RCLONE_REMOTE=pulsecoach-crypt:db`. **Crypt parolasını ayrıca bir parola
  yöneticisinde sakla** - pod kaybolursa yedekler ancak onunla açılır.
- `/health/ready`, en yeni yedek `HEALTH_MAX_BACKUP_AGE_HOURS`'tan (36) eskiyse 503 döner:
  duran yedekleme uptime izleyicisinden alarm olarak gelir.
- **Geri yükleme** (yerelde 2026-09-30'da prova edildi: 292 kullanıcı, tüm tablolar birebir):
  ```bash
  export RCLONE_CONFIG=/workspace/secrets/rclone.conf
  /workspace/opt/bin/rclone copy pulsecoach-crypt:db/<dosya>.dump /tmp/
  supervisorctl -c /workspace/pulse-coach/deploy/runpod/supervisord.conf stop web worker
  /usr/lib/postgresql/17/bin/pg_restore --clean --if-exists --no-owner \
      -h 127.0.0.1 -U pulsecoach -d pulsecoach /tmp/<dosya>.dump
  bash /workspace/pulse-coach/deploy/runpod/setup.sh
  ```

## Güncelleme ve yeniden başlatma

```bash
cd /workspace/pulse-coach && git pull --ff-only
bash deploy/runpod/setup.sh
```
Pod yeniden başladığında da yalnız `setup.sh` çalıştırılır. Betik idempotent: önce yedek
alır, `scripts.release` ile migration + katalog güncellemelerini + gömme önbelleğini
uygular, web/worker'ı yeniden başlatır. Loglar: `/workspace/logs/`.
Süreç durumu: `supervisorctl -c /workspace/pulse-coach/deploy/runpod/supervisord.conf status`.

## İzleme

Ücretsiz bir uptime servisi (UptimeRobot, Better Stack) ile
`https://api.pulsecoachapp.com/health/ready`'yi 5 dakikada bir yokla, 503/erişilemezlikte
e-posta alarmı kur. Yanıt yalnız `ok`/`degraded` ve kontrol adlarını içerir; kişisel veri
yoktur. Kontroller: veritabanı, Ollama + üç model, yedek tazeliği.

## Ollama ayarı

Canlı ayar (`supervisord.conf` + `.env`): `OLLAMA_NUM_PARALLEL=4`, `OLLAMA_FLASH_ATTENTION=1`,
`OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_MAX_LOADED_MODELS=3`, `LLM_NUM_CTX=32768`, `LLM_KEEP_ALIVE=24h`.

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
tek hata bilinen `strength_plus_cardio`). Pod'da `ollama ps` ile modellerin `100% GPU`
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
- Beta başlamadan: `/health/ready` izlemesi, SMTP (şifre sıfırlama) ve pod dışı yedek hazır olsun.
- **Geri bildirimden eval senaryosu:** beta kullanıcılarının mesajlarını `eval/` altına ham
  haliyle kopyalama (özel nitelikli sağlık verisi, repo herkese açık). Hatalı davranışı aynı
  kalıpta ama uydurma değerlerle yeniden yaz; test kullanıcılarına mesajlarının hata ayıklama
  için okunabileceğini baştan söyle.

## Yayın öncesi kontrol listesi (kod dışı)

- [ ] **KVKK yurt dışı aktarım (md. 9):** sunucu (RunPod, ABD şirketi), Cloudflare (tünel +
      R2) ve e-posta sağlayıcısı yurt dışında. 1 Eylül 2024'ten beri düzenli aktarımda açık
      rıza yeterli değil; yeterlilik kararı yoksa **Kurul'un standart sözleşmesi** imzalanıp
      5 iş günü içinde Kurum'a bildirilmeli. Sağlayıcıların bunu imzalayıp imzalamayacağı
      belirsiz - yayından önce bir KVKK avukatına danış (metin 1.5 bu aktarımı açıkça yazıyor).
- [ ] Pod seçilince sunucunun **ülkesini** KVKK 1.5'e ekle (web `src/app/kvkk/page.tsx`,
      mobil `app/kvkk.tsx`, TR + EN); alıcı değişirse `user_service.CONSENT_VERSION` artır.
- [ ] **SMTP:** şifre sıfırlama e-postası için gönderici (`SMTP_*`); boşsa link yalnız loga düşer.
- [ ] **Apple Private Email Relay:** gönderen alan adını Apple Developer → Services →
      *Sign in with Apple for Email Communication*'a kaydet, Cloudflare DNS'e SPF (+ DKIM) ekle;
      yoksa "E-postamı gizle" ile kaydolanlara sıfırlama e-postası ulaşmaz.
- [ ] Uptime izleyici `https://api.pulsecoachapp.com/health/ready` (5 dk, e-posta alarmı).
- [ ] rclone crypt parolası parola yöneticisinde; bir kez geri yükleme denendi.
- [ ] Mağaza kaydı: gizlilik politikası URL'si `https://pulsecoachapp.com/kvkk`, koşullar
      `https://pulsecoachapp.com/terms`.
- [ ] Sentry henüz yok (KVKK metni + DSN gerekir); hata takibi şimdilik `/workspace/logs`.
