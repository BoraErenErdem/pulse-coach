import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.router import router as auth_router
from app.chat_router import router as chat_router
from app.config import get_settings
from app.routers.checkins import router as checkins_router
from app.routers.daily_tip import router as daily_tip_router
from app.routers.exercise_goals import router as exercise_goals_router
from app.routers.mood import router as mood_router
from app.routers.nutrition import router as nutrition_router
from app.routers.profile import router as profile_router
from app.routers.progress import router as progress_router
from app.routers.workouts import router as workouts_router
from app.scheduler.scheduler import shutdown_scheduler, start_scheduler
from app.users_router import router as users_router

# Root logger'a kadar hiçbir yerde handler kurulmuyordu - uvicorn kendi
# logger'larını (uvicorn/uvicorn.access/uvicorn.error) ayrıca yönetiyor ama
# root logger boş kalıyordu, bu da app kodundaki (orchestrator.py,
# scheduler.py, email_service.py) TÜM logger.info() çağrılarının Python'ın
# "son çare" handler'ı (sadece WARNING+) yüzünden sessizce kaybolmasına yol
# açıyordu. Şifre sıfırlama dev-modu log'unu test ederken keşfedildi.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_migrations() -> None:
    """Uygulama açılışında şemayı Alembic ile head'e getirir - eskiden
    Base.metadata.create_all kullanılıyordu (Faz 1), artık kolon
    değişiklikleri/eklemeleri gerçek migration'larla takip ediliyor (bkz.
    backend/alembic/). Zaten head'deyse (ör. üretim DB'si) no-op, boş bir DB
    dosyasında ise create_all ile aynı davranışı verir - tüm tabloları
    sıfırdan oluşturur."""
    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


_run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.scheduler_enabled:
        start_scheduler()
    yield
    if settings.scheduler_enabled:
        shutdown_scheduler()


app = FastAPI(title="PulseCoach API", lifespan=lifespan)

# Origin listesi settings.cors_allowed_origins'ten geliyor (varsayılan sadece
# Next.js dev sunucusu) - mobil/PWA/prod origin'i eklemek için kod değil,
# .env'deki CORS_ALLOWED_ORIGINS değiştirilir (bkz. app/config.py).
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chat_router)
app.include_router(progress_router)
app.include_router(checkins_router)
app.include_router(workouts_router)
app.include_router(nutrition_router)
app.include_router(profile_router)
app.include_router(exercise_goals_router)
app.include_router(mood_router)
app.include_router(daily_tip_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
