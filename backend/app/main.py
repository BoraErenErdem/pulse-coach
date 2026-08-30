import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.auth.router import router as auth_router
from app.chat_router import router as chat_router
from app.config import get_settings
from app.routers.catalog import router as catalog_router
from app.routers.checkins import router as checkins_router
from app.routers.daily_tip import router as daily_tip_router
from app.routers.exercise_goals import router as exercise_goals_router
from app.routers.mood import router as mood_router
from app.routers.nutrition import router as nutrition_router
from app.routers.nutrition_photos import router as nutrition_photos_router
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

# 2026-08-30 güvenlik denetimi: config.py'deki jwt_secret_key varsayılanı
# ("change-me-in-.env") herkese açık repoda düz metin olarak duruyor - bu
# projede .env dosyası HİÇ oluşturulmamıştı, yani uygulama şimdiye kadar bu
# tahmin edilebilir anahtarla imzalanmış token'lar üretiyordu. Bu string'i
# bilen HERKES (repo public) geçerli bir access_token sahteleyip `sub`
# claim'ine istediği user_id'yi yazarak HER hesabı ele geçirebilirdi - sessiz
# bir varsayılana güvenmek yerine .env'de gerçek bir anahtar yoksa uygulama
# hiç AYAĞA KALKMASIN (fail-fast). Testler conftest.py'de kendi (yine sabit
# ama farklı, sadece test amaçlı) JWT_SECRET_KEY'ini env'e yazıyor.
_INSECURE_DEFAULT_JWT_SECRET = "change-me-in-.env"


def _guard_against_default_jwt_secret() -> None:
    if get_settings().jwt_secret_key == _INSECURE_DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET_KEY ayarlanmamış (backend/.env eksik ya da içinde "
            "JWT_SECRET_KEY yok). Bu güvensiz, herkese açık repoda görünen "
            "varsayılan değerle uygulama başlatılamaz - token sahteciliğine "
            "izin verir. backend/.env dosyasına rastgele/yüksek entropili "
            "bir JWT_SECRET_KEY ekleyin, örn.: "
            "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )


_guard_against_default_jwt_secret()


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
# allow_methods/allow_headers eskiden "*" idi - allow_credentials=True ile
# birlikte gereğinden gevşekti (2026-08-26 güvenlik denetimi); web/mobil
# istemcilerin GERÇEKTEN kullandığı yöntem/header'lara daraltıldı (bkz.
# web/src/lib/api.ts - Authorization, Content-Type, X-Preferred-Language).
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Preferred-Language"],
)


# 2026-08-30 güvenlik denetimi: hiçbir endpoint'te istek gövdesi büyüklüğü
# sınırlanmıyordu - /nutrition/photo-analyze bile MAX_PHOTO_BYTES kontrolünü
# (photo_meal_service.py) dosya TAMAMEN belleğe okunduktan (router'daki
# `await file.read()`) SONRA yapıyordu, yani bu kontrole hiç ulaşmadan çok
# büyük bir dosyayla bellek/disk tüketimi (DoS) mümkündü. Sınır,
# MAX_PHOTO_BYTES'ın (8MB) üzerine multipart boundary/header payı için bolca
# marj bırakıyor - JSON gövdeli diğer TÜM endpoint'ler için de zaten aşırı
# gevşek bir tavan (hiçbiri birkaç KB'ı geçmez).
_MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024  # 12 MB
_REQUEST_TOO_LARGE = {
    "tr": "İstek gövdesi çok büyük.",
    "en": "Request body is too large.",
}


@app.middleware("http")
async def _limit_request_body_size(request, call_next):
    """Content-Length header'ı varsa (web/mobil istemcilerin gerçekte
    kullandığı yol - hem fetch/multipart hem RN'in ağ katmanı bunu gönderir)
    erken, gövde hiç okunmadan reddeder. Content-Length'siz (chunked
    transfer-encoding) istekler bu kontrolden GEÇER - bu senaryo
    kapsanmıyor, ama bu API'ye gerçekte hiçbir istemci bu şekilde
    bağlanmıyor."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            too_large = int(content_length) > _MAX_REQUEST_BODY_BYTES
        except ValueError:
            too_large = False
        if too_large:
            header_lang = (request.headers.get("X-Preferred-Language") or "").strip().lower()
            language = header_lang if header_lang in ("tr", "en") else "tr"
            return JSONResponse({"detail": _REQUEST_TOO_LARGE[language]}, status_code=413)
    return await call_next(request)


@app.middleware("http")
async def _security_headers(request, call_next):
    """Tarayıcı tabanlı istemciler (web) için savunma-derinliği header'ları -
    daha önce hiçbiri set edilmiyordu (2026-08-26 güvenlik denetimi). Mobil
    (Expo) istemciler bu header'ları görmezden gelir, zararsız."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chat_router)
app.include_router(progress_router)
app.include_router(checkins_router)
app.include_router(workouts_router)
app.include_router(nutrition_router)
app.include_router(nutrition_photos_router)
app.include_router(catalog_router)
app.include_router(profile_router)
app.include_router(exercise_goals_router)
app.include_router(mood_router)
app.include_router(daily_tip_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
