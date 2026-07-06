# Sağlıklı Yaşam Koçu (Health & Fitness Coach Agent)

Kullanıcı hedeflerine göre kişiselleştirilmiş, bilgilendirici öneriler sunan proaktif bir multi-agent koçluk sistemi.

> Bu bir doktor/diyetisyen değildir. Sistem tıbbi teşhis veya kesin diyet/ilaç tavsiyesi vermez.

## Mimari

```
[Web UI: Streamlit] ---> [FastAPI Backend] ---> [Agent Core: LangChain + Ollama] ---> [SQLite DB]
                                                        |
                                              [APScheduler: proaktif check-in job]
```

## Durum

- [x] Faz 1 — İskelet: FastAPI + SQLite + SQLAlchemy modelleri, register/login (JWT)
- [ ] Faz 2 — Orchestrator + Profil Agent
- [ ] Faz 3 — Beslenme & Egzersiz Agent + RAG
- [ ] Faz 4 — Takip & Motivasyon Agent
- [ ] Faz 5 — Proaktif Check-in
- [ ] Faz 6 — Streamlit Arayüz
- [ ] Faz 7 — Test & Dokümantasyon

## Kurulum

```bash
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
copy .env.example .env   # ve JWT_SECRET_KEY değerini değiştir
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

## Ollama Gereksinimleri

Aşağıdaki modellerin lokal Ollama kurulumunda hazır olması gerekir:

```bash
ollama pull gemma4:e4b
ollama pull nomic-embed-text
```

Model adı `backend/app/config.py` üzerinden env değişkeni (`LLM_MODEL_NAME`) ile değiştirilebilir.
