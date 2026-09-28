from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.log_date import past_date_note, resolve_log_date
from app.services import progress_service, weekly_goal_service
from app.services.user_time import user_today


def build_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def log_progress(
        weight: float | None = None,
        waist_cm: float | None = None,
        body_fat_pct: float | None = None,
        workout_completed: bool | None = None,
        workout_type: str | None = None,
        days_ago: int | None = None,
    ) -> str:
        """Kullanıcının bugünkü kilosunu, opsiyonel olarak bel çevresini (cm)
        ve/veya vücut yağ oranını (%), ve/veya antrenman yapıp yapmadığını
        kaydeder. Kullanıcı 'bugün 78 kilo geldim', 'belim 85 cm oldu' veya
        'bugün antrenman yaptım' gibi bir ilerleme bilgisi paylaştığında bu
        aracı çağır. workout_completed True ise ve kullanıcı belirtmişse
        workout_type'ı da ilet: kuvvet, kardiyo, esneklik veya karışık
        değerlerinden biri olmalı. Ölçüm/antrenman GEÇMİŞ bir güne aitse
        days_ago ver (dün=1, evvelsi gün=2, en fazla 7); bugün için boş bırak."""
        log_date = resolve_log_date(db, user_id, days_ago)
        if isinstance(log_date, str):
            return log_date
        type_note = ""
        if workout_type is not None and workout_type not in progress_service.VALID_WORKOUT_TYPES:
            # Önceden bu mesajı döndürüp HİÇBİR ŞEY kaydetmiyordu (2026-09-27).
            workout_type = None
            type_note = " Antrenman türü kuvvet/kardiyo/esneklik/karışık olmadığı için türsüz kaydedildi."

        try:
            entry = progress_service.log_progress(
                db,
                user_id,
                weight=weight,
                waist_cm=waist_cm,
                body_fat_pct=body_fat_pct,
                workout_completed=workout_completed,
                workout_type=workout_type,
                log_date=log_date,
            )
        except ValueError as exc:
            # weight/waist_cm/body_fat_pct icin aralik disi bir deger (ör.
            # LLM'in mesajdan yanlis bir sayi cikarmasi) - str(exc) HER ZAMAN
            # Turkce doner (bkz. exceptions.py docstring), orchestrator'a
            # baglam olarak gidiyor. "Kaydedilmedi" öneki: orkestratör başarısız sayar.
            return f"Kaydedilmedi: {exc}"
        return (
            f"Kayıt eklendi ({entry.log_date}): "
            f"kilo={entry.weight if entry.weight is not None else 'belirtilmedi'}, "
            f"antrenman={'yapıldı' if entry.workout_completed else 'yapılmadı'}"
            + (f" ({entry.workout_type})" if entry.workout_type else "") + "."
            + past_date_note(entry.log_date, user_today(db, user_id))
            + type_note
        )

    @tool
    def get_weekly_summary() -> str:
        """Kullanıcının son 7 gündeki ilerlemesinin (antrenman sayısı, kilo trendi)
        özetini ve bu takvim haftasının (Pazartesiden beri) antrenman günü sayısını
        döndürür. Kullanıcı 'bu haftam nasıldı' / 'bu hafta kaç gün antrenman
        yaptım' gibi bir şey sorduğunda bu aracı çağır."""
        # "Bu hafta" sorusunda koç son 7 günü söylüyordu, uygulamadaki haftalık
        # hedef halkası ise Pazartesiden sayıyor (canlı test 2026-09-28).
        return (
            progress_service.generate_weekly_summary(db, user_id).as_text()
            + " (Kullanıcı 'bu hafta' derse aşağıdaki takvim haftası sayısını kullan.) "
            + weekly_goal_service.get_weekly_goal_progress(db, user_id).as_text()
        )

    return [log_progress, get_weekly_summary]
