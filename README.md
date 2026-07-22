# PulseCoach (Sağlıklı Yaşam Koçu — Health & Fitness Coach Agent)

Kullanıcı hedeflerine göre kişiselleştirilmiş, bilgilendirici öneriler sunan proaktif bir multi-agent koçluk sistemi.

> Bu bir doktor/diyetisyen değildir. Sistem tıbbi teşhis veya kesin diyet/ilaç tavsiyesi vermez.

## Mimari

```
[Web UI: Streamlit] ---> [FastAPI Backend] ---> [Agent Core: LangChain + Ollama] ---> [SQLite DB]
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
- [x] Faz 6 — Streamlit Arayüz
- [x] Faz 7 — Test & Dokümantasyon

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
```

## Çalıştırma

```bash
cd backend
python -m uvicorn app.main:app --reload
```

API varsayılan olarak `http://127.0.0.1:8000` üzerinde çalışır. `/health` endpoint'i ile durum kontrol edilebilir.
Uygulama açılırken haftalık proaktif check-in job'ı (her Pazar 20:00) otomatik olarak zamanlanır.

Streamlit arayüzünü ayrı bir terminalde başlatın:

```bash
cd frontend
streamlit run streamlit_app.py
```

Arayüz varsayılan olarak backend'e `http://localhost:8000` üzerinden bağlanır; farklı bir adres
için `PULSECOACH_API_BASE_URL` ortam değişkenini kullanın.

## Test

```bash
cd backend
python -m pytest -v
```

`test_chat.py` içindeki testler gerçek lokal Ollama modelini çağırır (`@pytest.mark.integration`) —
çalışması için Ollama servisinin ve `gemma4:e4b` modelinin kurulu/çalışır olması gerekir.

## Demo Akışı

Uygulamayı ilk kez deneyecekler için uçtan uca kısa bir akış:

1. Backend'i (`uvicorn`) ve Streamlit arayüzünü yukarıdaki adımlarla başlatın.
2. Streamlit arayüzünde "Kayıt Ol" ile yeni bir hesap oluşturun, ardından giriş yapın.
3. Sohbet ekranında serbest metinle profil bilgisi verin: *"Kilo vermek istiyorum, vejetaryenim."*
   → Profil Agent bu bilgiyi profile kaydeder.
4. Beslenme veya egzersiz ile ilgili bir soru sorun: *"Günlük protein ihtiyacımı nasıl hesaplarım?"*
   → Beslenme Agent, RAG bilgi tabanından yararlanarak kaynağa dayalı bir cevap üretir.
5. İlerleme kaydedin: sohbette *"Bugün 78 kilo geldim, kuvvet antrenmanı yaptım"* yazın **veya**
   "İlerleme Kaydı" formunu kullanın — ikisi de aynı veriyi kaydeder.
6. "Bu haftam nasıl geçti?" diye sorun veya haftalık özet/grafik ekranına bakın
   → Takip Agent özet çıkarır, Motivasyon Agent bunu sıcak bir dille yeniden ifade eder.
7. Proaktif check-in mesajları, `WEEKLY_CHECKIN_*` env değişkenleriyle zamanlanan APScheduler job'ı
   tarafından otomatik üretilip `checkin_messages` tablosuna yazılır (uygulama açıkken arka planda çalışır).

## Ollama Gereksinimleri

Aşağıdaki modellerin lokal Ollama kurulumunda hazır olması gerekir:

```bash
ollama pull gemma4:e4b
ollama pull nomic-embed-text
```

Model adı `backend/app/config.py` üzerinden env değişkeni (`LLM_MODEL_NAME`) ile değiştirilebilir.
