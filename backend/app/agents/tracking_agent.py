from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.services import progress_service


def build_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def log_progress(
        weight: float | None = None,
        waist_cm: float | None = None,
        body_fat_pct: float | None = None,
        workout_completed: bool | None = None,
        workout_type: str | None = None,
    ) -> str:
        """Kullanıcının bugünkü kilosunu, opsiyonel olarak bel çevresini (cm)
        ve/veya vücut yağ oranını (%), ve/veya antrenman yapıp yapmadığını
        kaydeder. Kullanıcı 'bugün 78 kilo geldim', 'belim 85 cm oldu' veya
        'bugün antrenman yaptım' gibi bir ilerleme bilgisi paylaştığında bu
        aracı çağır. workout_completed True ise ve kullanıcı belirtmişse
        workout_type'ı da ilet: kuvvet, kardiyo, esneklik veya karışık
        değerlerinden biri olmalı."""
        if workout_type is not None and workout_type not in progress_service.VALID_WORKOUT_TYPES:
            return (
                "Antrenman türü kuvvet, kardiyo, esneklik veya karışık olmalı; "
                "bu bilgi olmadan kaydedildi."
            )

        try:
            entry = progress_service.log_progress(
                db,
                user_id,
                weight=weight,
                waist_cm=waist_cm,
                body_fat_pct=body_fat_pct,
                workout_completed=workout_completed,
                workout_type=workout_type,
            )
        except ValueError as exc:
            # weight/waist_cm/body_fat_pct icin aralik disi bir deger (ör.
            # LLM'in mesajdan yanlis bir sayi cikarmasi) - str(exc) HER ZAMAN
            # Turkce doner (bkz. exceptions.py docstring), orchestrator'a
            # baglam olarak gidiyor.
            return str(exc)
        return (
            f"Kayıt eklendi ({entry.log_date}): "
            f"kilo={entry.weight if entry.weight is not None else 'belirtilmedi'}, "
            f"antrenman={'yapıldı' if entry.workout_completed else 'yapılmadı'}"
            + (f" ({entry.workout_type})" if entry.workout_type else "") + "."
        )

    @tool
    def get_weekly_summary() -> str:
        """Kullanıcının son 7 gündeki ilerlemesinin (antrenman sayısı, kilo trendi)
        özetini döndürür. Kullanıcı 'bu haftam nasıldı' gibi bir şey sorduğunda bu aracı
        çağır."""
        return progress_service.generate_weekly_summary(db, user_id).as_text()

    return [log_progress, get_weekly_summary]
