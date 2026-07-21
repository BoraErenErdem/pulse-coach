from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.auth.router import router as auth_router
from app.chat_router import router as chat_router
from app.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.routers.progress import router as progress_router
from app.scheduler.scheduler import shutdown_scheduler, start_scheduler
from app.users_router import router as users_router

# Faz 1: tabloları senkron olarak oluştur. İleride Alembic migration'a geçilebilir.
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.scheduler_enabled:
        start_scheduler()
    yield
    if settings.scheduler_enabled:
        shutdown_scheduler()


app = FastAPI(title="PulseCoach API", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chat_router)
app.include_router(progress_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
