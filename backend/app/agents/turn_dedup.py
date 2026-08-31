from typing import Generic, TypeVar
from app.services.fuzzy_match import tr_lower

T = TypeVar("T")


class TurnDedupGuard(Generic[T]):
    """Bir `run_orchestrator` çağrısının (TEK bir "tur") içinde, aynı ada
    sahip bir varlık için AYNI item listesinin ikinci kez loglanmasını
    sessizce engeller — `workout_tracking_agent.py`'de 2026-08-05 canlı
    testinde bulunan "uzun tool-call zincirinde LLM kendi önceki çıktısını
    unutup aynı seti/besini ikinci kez üretiyor" bug'ına karşı deterministik
    bir güvenlik ağı. `nutrition_tracking_agent.py`'de birebir aynı kod
    ayrıca yazılmıştı (2026-08-10 mimari borç raporu, bulgu #4) — artık tek
    bir yerde.

    Her `build_*_tools(db, user_id)` çağrısı YENİ bir instance oluşturmalı
    (closure'da tutulur) — turlar arası state SIZMAMALI."""

    def __init__(self) -> None:
        self._turn_logged: dict[str, list[T]] = {}

    def is_exact_repeat(self, name: str, items: list[T]) -> bool:
        key = tr_lower(name.strip())
        prior = self._turn_logged.get(key, [])
        if items and prior[-len(items) :] == items:
            return True
        self._turn_logged[key] = prior + items
        return False

    def seed(self, name: str, items: list[T]) -> None:
        """Bu turdan ÖNCE (ör. bugün daha önceki bir sohbet turunda) zaten
        kaydedilmiş item'ları, hiçbir "tekrar" kontrolü yapmadan geçmişe
        ekler — `is_exact_repeat`'in "AYNI turdaki" tanımını "bugüne kadarki"
        şekline genişletmek için kullanılır (bkz.
        workout_tracking_agent.py/nutrition_tracking_agent.py'deki çağıran
        kod, 2026-08-31 canlı testte bulunan tur-arası çift-kayıt bug'ı).
        Sıra ÖNEMLİ — DB'den kronolojik (id artan) sırayla okunmalı, aksi
        halde `is_exact_repeat`'in kuyruk (suffix) karşılaştırması yanlış
        pozitif/negatif üretebilir."""
        key = tr_lower(name.strip())
        self._turn_logged[key] = self._turn_logged.get(key, []) + items
