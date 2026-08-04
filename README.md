# PulseCoach (Sağlıklı Yaşam Koçu — Health & Fitness Coach Agent)

Kullanıcı hedeflerine göre kişiselleştirilmiş, bilgilendirici öneriler sunan proaktif bir multi-agent koçluk sistemi.

> Bu bir doktor/diyetisyen/terapist değildir. Sistem tıbbi teşhis veya kesin diyet/ilaç tavsiyesi vermez;
> ruh sağlığı konularında da terapi ya da psikolojik teşhis yapmaz.

## Mimari

```
[Web UI: Next.js] ---> [FastAPI Backend] ---> [Agent Core: LangChain + Ollama] ---> [SQLite DB]
                                                      |         |
                                                      |   [RAG: FAISS + nomic-embed-text]
                                                      |
                                            [APScheduler: proaktif check-in job]
```

## Durum

- [x] Faz 1 — İskelet: FastAPI + SQLite + SQLAlchemy modelleri, register/login (JWT)
- [x] Faz 2 — Orchestrator + Profil Agent (LangChain + Ollama, ReAct)
- [x] Faz 3 — Beslenme & Egzersiz Agent + RAG (FAISS + nomic-embed-text)
- [x] Faz 4 — Takip & Motivasyon Agent
- [x] Faz 5 — Proaktif Check-in (APScheduler)
- [x] Faz 6 — Web Arayüzü (başlangıçta Streamlit ile yapıldı, sonra Next.js'e geçirildi — Streamlit prototipi kaldırıldı, tek arayüz artık `web/`)
- [x] Faz 7 — Test & Dokümantasyon
- [x] Ruh Hali Destek Agent — duygu durumu desteği + deterministik kriz yönlendirme protokolü
- [x] Model Karşılaştırması — gemma4:e4b vs qwen3:14b, gemma4:e4b production modeli olarak seçildi
- [x] Antrenman detayı (set/tekrar/ağırlık) + beslenme/öğün takibi, egzersiz/besin kataloğu
- [x] Hedefler (kilo, beslenme, egzersiz ağırlık hedefleri)
- [x] Ruh hali seçici (MoodPicker) backend'e bağlı, günlük kayıt + agent bağlamı
- [x] Fotoğrafla öğün ekleme — yemek fotoğrafı yükleyip besinleri/tahmini
      porsiyonları tanıma (`gemma4:12b` native vision, kalori/makrolar her
      zaman katalogdan hesaplanır, kullanıcı onayı zorunlu)
- [x] Besin kataloğu — USDA (SR Legacy + Foundation Foods + Survey/FNDDS,
      gemma4:12b ile toplu Türkçeye çevrilmiş) + Türk mutfağına özgü
      internetten araştırılan kayıtların hibrit modeli (~7800 besin)
- [x] Günün ipucu — 6 kategoride (Beslenme/Spor/Sağlık/Ruh Hali/Yaşam
      Koçluğu/Yaşam) rastgele seçim, sohbet ekranında kalıcı kompakt banner
- [x] Mobil responsive arayüz (hamburger menü, dar ekran desteği)

## Model Karşılaştırması

Spec'teki değerlendirme çerçevesine göre iki turda (42 ve 82 senaryo, toplam 248 çağrı) `gemma4:e4b`
ile `qwen3:14b` karşılaştırıldı: tool-calling doğruluğu, orchestrator yönlendirmesi, RAG kaynağına
sadakat, güvenlik sınırı uyumu, Türkçe dil kalitesi ve yanıt süresi ölçüldü. **`gemma4:e4b` production
modeli olarak seçildi** — iki turda da RAG kaynağına daha sadık (sıfır halüsinasyon), doğru ölçüldüğünde
~%40 daha hızlı ve güvenlik sınırında en az qwen3:14b kadar güçlü çıktı. Tüm sonuç tabloları, grafikler
ve somut örnekler için bkz. [`backend/eval/results/model_comparison.md`](backend/eval/results/model_comparison.md).

## Kurulum

```bash
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```

Repo kökünde bir `.env` dosyası oluşturup gerekli değişkenleri tanımlayın (bkz. `backend/app/config.py`
içindeki `Settings` sınıfı için tüm varsayılanlar):

```
DATABASE_URL=sqlite:///./health_coach.db
JWT_SECRET_KEY=uzun-rastgele-bir-deger
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=gemma4:e4b
EMBEDDING_MODEL_NAME=nomic-embed-text
FAISS_INDEX_PATH=./faiss_index
KNOWLEDGE_BASE_PATH=./knowledge_base
SCHEDULER_ENABLED=true
WEEKLY_CHECKIN_DAY_OF_WEEK=sun
WEEKLY_CHECKIN_HOUR=20
WEEKLY_CHECKIN_MINUTE=0

# Opsiyonel — sadece besin kataloğunu USDA'dan sıfırdan yeniden oluşturmak
# isteyenler için (fdc.nal.usda.gov/api-key-signup, ücretsiz).
# Günlük kullanımda GEREKMİYOR, katalog zaten DB'de hazır.
USDA_API_KEY=
```

## Çalıştırma

```bash
cd backend
python -m uvicorn app.main:app --reload
```

API varsayılan olarak `http://127.0.0.1:8000` üzerinde çalışır. `/health` endpoint'i ile durum kontrol edilebilir.
Uygulama açılırken haftalık proaktif check-in job'ı (her Pazar 20:00) otomatik olarak zamanlanır.

Veritabanı şeması Alembic ile yönetilir; uygulama her açılışta `alembic upgrade head` çalıştırıp şemayı
otomatik günceller (boş bir DB dosyasında tüm tabloları sıfırdan oluşturur). Bir modele yeni bir
kolon/tablo eklerseniz migration'ı elle oluşturmanız gerekir:

```bash
cd backend
python -m alembic revision --autogenerate -m "kisa-aciklama"
```

Oluşan dosyayı `backend/alembic/versions/` altında gözden geçirip commit'leyin.

Web arayüzünü ayrı bir terminalde başlatın:

```bash
cd web
npm install
npm run dev
```

Arayüz `http://localhost:3000` üzerinde açılır, backend'e varsayılan olarak `http://localhost:8000`
üzerinden bağlanır; farklı bir adres için `web/.env.local` içinde `NEXT_PUBLIC_API_BASE_URL`
değişkenini kullanın.

## Test

```bash
cd backend
python -m pytest -v
```

290 test var: `@pytest.mark.integration` işaretli olanlar (chat, RAG, haftalık özet job'ı gibi gerçek Ollama
çağrısı içeren senaryolar) hariç geri kalanı Ollama'ya ihtiyaç duymadan çalışır. Ruh Hali Destek Agent'ın kriz
tespiti, "hiç kaçırmıyor" standardında ayrıca geniş bir senaryo setiyle test edilir (`tests/test_mood_support.py`).

```bash
python -m pytest -v -m "not integration"   # hızlı, Ollama gerektirmez
python -m pytest -v -m "integration"       # Ollama servisi ve modelleri çalışır olmalı
```

## Demo Akışı

Uygulamayı ilk kez deneyecekler için uçtan uca kısa bir akış:

1. Backend'i (`uvicorn`) ve web arayüzünü (`web/`, Next.js) yukarıdaki adımlarla başlatın.
2. Web arayüzünde "Kayıt Ol" ile yeni bir hesap oluşturun, ardından giriş yapın.
3. Sohbet ekranında serbest metinle profil bilgisi verin: *"Kilo vermek istiyorum, vejetaryenim."*
   → Profil Agent bu bilgiyi profile kaydeder.
4. Beslenme veya egzersiz ile ilgili bir soru sorun: *"Günlük protein ihtiyacımı nasıl hesaplarım?"*
   → Beslenme Agent, RAG bilgi tabanından yararlanarak kaynağa dayalı bir cevap üretir.
5. İlerleme kaydedin: sohbette *"Bugün 78 kilo geldim, kuvvet antrenmanı yaptım"* yazın **veya**
   "İlerleme Kaydı" formunu kullanın — ikisi de aynı veriyi kaydeder.
6. Beslenme sayfasında "Fotoğrafla Ekle" ile bir yemek fotoğrafı yükleyin — model besinleri/tahmini
   porsiyonları önerir, siz onaylamadan hiçbir şey kaydedilmez (kalori/makrolar her zaman katalogdan
   hesaplanır, tahmini değer yazılmaz).
7. "Bu haftam nasıl geçti?" diye sorun veya haftalık özet/grafik ekranına bakın
   → Takip Agent özet çıkarır, Motivasyon Agent bunu sıcak bir dille yeniden ifade eder.
8. Kötü bir gün geçirdiğinizi belirtin: *"Bugün antrenmanı atladım, kendimi kötü hissediyorum."*
   → Ruh Hali Destek Agent, yargılamadan destekleyici bir yanıt verir (bkz. aşağıdaki not).
9. Proaktif check-in mesajları, `WEEKLY_CHECKIN_*` env değişkenleriyle zamanlanan APScheduler job'ı
   tarafından otomatik üretilip `checkin_messages` tablosuna yazılır (uygulama açıkken arka planda çalışır);
   web arayüzündeki "Check-in'ler" sayfasından (`GET /checkins`) görüntülenebilir.

**Ruh Hali Destek Agent ve kriz yönlendirme notu:** Kullanıcı kötü bir gün/motivasyon kaybı gibi hafif bir
duygu durumu ifade ettiğinde Ruh Hali Destek Agent devreye girip yargılamayan, destekleyici bir yanıt üretir.
Ancak kendine zarar verme düşüncesi, uzun süreli çökkünlük veya yeme bozukluğu belirtisi gibi ciddi bir sinyal
tespit edilirse, sistem LLM'e hiç sormadan sabit, önceden tanımlanmış bir yönlendirme mesajı döner (112 ve bir
uzmana yönlendirme içerir) ve sohbeti normal akışa döndürmez — bu davranış deterministik bir anahtar kelime/regex
katmanıyla sağlanır, modelin serbest üretimine bırakılmaz (bkz. `backend/app/agents/mood_support_agent.py`).

## Ollama Gereksinimleri

Ollama servisinin çalışır durumda olması ve aşağıdaki modellerin lokal kurulumda hazır olması gerekir:

```bash
ollama serve            # servis arka planda çalışmıyorsa
ollama pull gemma4:e4b       # sohbet/agent'lar
ollama pull nomic-embed-text # RAG embedding
ollama pull gemma4:12b       # fotoğrafla öğün analizi (native vision)
```

`gemma4:e4b`, Ollama'nın 'vision' capability'si listelemesine rağmen fotoğrafları işlemiyor — bu yüzden
fotoğraf analizinde ayrı, daha büyük bir model (`gemma4:12b`) kullanılıyor; 3 gerçek yemek fotoğrafıyla
`gemma3:4b`'ye karşı test edilip özellikle pişirme durumu tespitinde (kalori hesabını etkiliyor) daha
isabetli çıktığı için seçildi. Model adları `backend/app/config.py` üzerinden env değişkenleriyle
(`LLM_MODEL_NAME`, `PHOTO_VISION_MODEL_NAME`) değiştirilebilir.

## Besin Kataloğu

Katalog iki kaynağın hibriti:

- **USDA FoodData Central** (SR Legacy + Foundation Foods + Survey/FNDDS, ~7800 kayıt) — İngilizce
  açıklamalar `gemma4:12b` ile toplu çevrilip cache'lenir (`backend/scripts/translate_catalog.py`),
  sonra DB'ye yüklenir (`backend/scripts/seed_catalogs.py`). Arama/eşleştirme SADECE Türkçe isim
  (`name_tr`) üzerinden çalışır.
- **`backend/scripts/seed_tr_foods.py`** — USDA'da karşılığı olmayan/kötü temsil edilen Türk mutfağı
  besinleri (baklava, lahmacun, künefe, tavuk göğsü/pirinç gibi çok kullanılan temel besinler vb.),
  diyetkolik.com gibi Türkçe kaynaklardan araştırılıp elle eklenir.

Günlük kullanımda hiçbir kurulum adımı GEREKMEZ — katalog zaten DB'ye yüklü. Sadece USDA verisini
sıfırdan yeniden oluşturmak istenirse (`USDA_API_KEY` gerekir):

```bash
cd backend
python -m scripts.curate_food_subset
python -m scripts.translate_catalog --only foods --model gemma4:12b --no-reasoning
python -m scripts.seed_catalogs --force --only food
```
