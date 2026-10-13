from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.log_date import days_ago_for_value, past_date_note, resolve_log_date
from app.agents.workout_tracking_agent import mentions_duration
from app.models.workout_session import WorkoutSession
from app.models.workout_set import WorkoutSet
from app.services import progress_service, weekly_goal_service
from app.services.user_time import user_today

# Süreli aktivite yalnız "antrenman yapıldı" işaretiyle geldiğinde dönen yanıtın
# işareti. Orkestratör bunu antrenman kaydı başarısızlığı sayar (bkz.
# orchestrator._append_partial_failure_note).
DURATION_WORKOUT_REDIRECT = "Kaydedilmedi (süreli antrenman)"
_DURATION_WORKOUT_TYPES = {"kardiyo", "esneklik"}
_REDIRECT_INSTRUCTION = (
    "mesajda süresi belli bir aktivite var, bu araç süreyi kaydedemez. Kullanıcıya SORMADAN şimdi "
    "log_exercise_set'i çağır: duration_minutes = mesajdaki süre, cardio_category = aktivite "
    "(kosu/bisiklet/yuruyus/yuzme/ip_atlama/genel_kardiyo/esneklik), intensity belirtilmediyse orta, "
    "geçmiş bir günse days_ago. Yalnız mesajdaki süre açıkça başka bir şeye aitse (ör. uyku) aktivitenin "
    "kaç dakika sürdüğünü sor. Yanıtında araç adlarını anma; kaydedilmeyen bir şey için "
    "'kaydettim/ekledim' deme."
)


def build_tracking_tools(
    db: Session, user_id: int, expected_days_ago: int | None = None, user_message: str = ""
) -> list[BaseTool]:
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
        days_ago ver (dün=1, evvelsi gün=2, en fazla 7); bugün için boş bırak.
        SÜRESİ belli bir aktivite ('45 dakika bisiklet sürdüm', '40 dk yüzdüm')
        için antrenmanı BU ARAÇLA işaretleme: log_exercise_set'i duration_minutes
        ile çağır, yoksa süre kaydedilmez."""
        # Karışık günlü mesajda değerin geçtiği cümlenin günü (bkz. days_ago_for_value).
        value_day = days_ago_for_value(user_message, weight if weight is not None else waist_cm)
        if value_day is not None:
            days_ago = value_day
        log_date = resolve_log_date(db, user_id, days_ago, expected_days_ago)
        if isinstance(log_date, str):
            return log_date
        # 2026-10-13 eval (mixed_day_weight, past_swim): "dün 45 dakika bisiklet sürdüm"
        # mesajında model bazen log_exercise_set yerine yalnız antrenman işareti gönderiyor -
        # süre kayboluyor, koç yine de "45 dakikayı kaydettim" diyordu. Süreli set o gün
        # zaten kayıtlıysa işaret gereksiz (set kaydı işareti kendisi oluşturur).
        redirect_note = ""
        if workout_completed and workout_type in _DURATION_WORKOUT_TYPES and mentions_duration(user_message):
            has_measurement = weight is not None or waist_cm is not None or body_fat_pct is not None
            already_logged = (
                db.query(WorkoutSet.id)
                .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
                .filter(
                    WorkoutSession.user_id == user_id,
                    WorkoutSession.session_date == log_date,
                    WorkoutSet.duration_minutes.isnot(None),
                )
                .first()
                is not None
            )
            if already_logged:
                redirect_note = " Antrenman bu gün için süresiyle zaten kayıtlı, ayrıca işaretlenmedi."
                if not has_measurement:
                    return redirect_note.strip()
            else:
                if not has_measurement:
                    return f"{DURATION_WORKOUT_REDIRECT}: {_REDIRECT_INSTRUCTION}"
                redirect_note = f" ANTRENMAN İŞARETİ EKLENMEDİ - {DURATION_WORKOUT_REDIRECT}: {_REDIRECT_INSTRUCTION}"
            workout_completed, workout_type = None, None
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
            + redirect_note
        )

    @tool
    def get_weekly_summary() -> str:
        """Kullanıcının son 7 gündeki ilerlemesinin (antrenman sayısı, kilo trendi)
        özetini ve bu takvim haftasının (Pazartesiden beri) antrenman günü sayısını
        döndürür. Kullanıcı 'bu haftam nasıldı' / 'bu hafta kaç gün antrenman
        yaptım' gibi bir şey sorduğunda bu aracı çağır."""
        # "Bu hafta" sorusunda koç son 7 günü söylüyordu, uygulamadaki haftalık
        # hedef halkası ise Pazartesiden sayıyor (canlı test 2026-09-28).
        # Takvim haftası ÖNCE: sona eklenen not yetmedi, model yine son 7 günü söyledi.
        week = weekly_goal_service.get_weekly_goal_progress(db, user_id)
        return (
            f"BU HAFTA (takvim haftası, Pazartesiden bugüne): {week.done_days} gün antrenman. "
            f"{week.as_text()} Kullanıcı 'bu hafta' diye sorarsa YALNIZCA bu sayıyı kullan. "
            "Aşağıdaki son 7 gün özeti geçen haftanın günlerini de içerir, 'bu hafta' diye sunma: "
            + progress_service.generate_weekly_summary(db, user_id).as_text()
        )

    return [log_progress, get_weekly_summary]
