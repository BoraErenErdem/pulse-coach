"""Zamanlanmış işler için ayrı süreç (2026-09-26): `python -m app.worker`.

Canlıda web sunucusu birden fazla süreçle (uvicorn --workers N) çalışınca her
süreç kendi zamanlayıcısını başlatırsa hatırlatmalar ve haftalık özetler N kez
gider. Önerilen düzen:

- web:    SCHEDULER_ENABLED=false RUN_MIGRATIONS_ON_STARTUP=false uvicorn ... --workers N
- sürüm:  alembic upgrade head   (her dağıtımda bir kez, web başlamadan önce)
- worker: python -m app.worker   (tek süreç)

Postgres'te lider kilidi (bkz. scheduler.py) ikinci bir worker'ın ya da
zamanlayıcısı açık kalmış bir web sürecinin işleri tekrar çalıştırmasını ayrıca
engeller. Bu süreç migration çalıştırmaz ve web uygulamasını (app.main) import etmez.
"""

import logging
import signal
import threading

from app.scheduler.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger("app.worker")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    stop = threading.Event()

    def _request_stop(signum, _frame) -> None:
        logger.info("Worker durduruluyor (sinyal %s)", signum)
        stop.set()

    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)

    if start_scheduler() is None:
        logger.error("Başka bir süreç zamanlayıcıyı zaten çalıştırıyor - worker çıkıyor.")
        return 1
    logger.info("Worker çalışıyor; zamanlanmış işler bu süreçte.")
    try:
        # Kısa aralıklı bekleme: Windows'ta Ctrl+C sinyali ancak ana iş parçacığı
        # uyanınca işleniyor.
        while not stop.wait(1.0):
            pass
    finally:
        shutdown_scheduler()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
