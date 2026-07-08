from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.services import progress_service


def build_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def log_progress(
        weight: float | None = None,
        workout_completed: bool | None = None,
        workout_type: str | None = None,
    ) -> str:
        """Kullanıcının bugünkü kilosunu ve/veya antrenman yapıp yapmadığını kaydeder.
        Kullanıcı 'bugün 78 kilo geldim' veya 'bugün antrenman yaptım' gibi bir ilerleme
        bilgisi paylaştığında bu aracı çağır. workout_completed True ise ve kullanıcı
        belirtmişse workout_type'ı da ilet: kuvvet, kardiyo, esneklik veya karışık
        değerlerinden biri olmalı."""
        if workout_type is not None and workout_type not in progress_service.VALID_WORKOUT_TYPES:
            return (
                "Antrenman türü kuvvet, kardiyo, esneklik veya karışık olmalı; "
                "bu bilgi olmadan kaydedildi."
            )

        entry = progress_service.log_progress(
            db,
            user_id,
            weight=weight,
            workout_completed=workout_completed,
            workout_type=workout_type,
        )
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
