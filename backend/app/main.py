from fastapi import FastAPI
from app.auth.router import router as auth_router
from app.chat_router import router as chat_router
from app.db.base import Base
from app.db.session import engine
from app.users_router import router as users_router

# Faz 1: tabloları senkron olarak oluştur. İleride Alembic migration'a geçilebilir.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sağlıklı Yaşam Koçu API")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chat_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
