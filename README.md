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
- [ ] Faz 4 — Takip & Motivasyon Agent
- [ ] Faz 5 — Proaktif Check-in
- [ ] Faz 6 — Streamlit Arayüz
- [ ] Faz 7 — Test & Dokümantasyon

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
```

## Çalıştırma

```bash
cd backend
python -m uvicorn app.main:app --reload
```

API varsayılan olarak `http://127.0.0.1:8000` üzerinde çalışır. `/health` endpoint'i ile durum kontrol edilebilir.

## Test

```bash
cd backend
python -m pytest -v
```

`test_chat.py` içindeki testler gerçek lokal Ollama modelini çağırır (`@pytest.mark.integration`) —
çalışması için Ollama servisinin ve `gemma4:e4b` modelinin kurulu/çalışır olması gerekir.

## Ollama Gereksinimleri

Aşağıdaki modellerin lokal Ollama kurulumunda hazır olması gerekir:

```bash
ollama pull gemma4:e4b
ollama pull nomic-embed-text
```

Model adı `backend/app/config.py` üzerinden env değişkeni (`LLM_MODEL_NAME`) ile değiştirilebilir.
