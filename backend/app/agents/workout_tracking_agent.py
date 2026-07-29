from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.services import exercise_catalog_service, exercise_goal_service, workout_service


def build_workout_tracking_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def search_exercise_catalog(query: str) -> str:
        """Egzersiz kataloğunda isimle arama yapar, en yakın eşleşen adayları
        Türkçe isimleriyle listeler. Kullanıcının söylediği egzersiz adı
        kataloğa net eşleşmiyorsa (log_exercise_set belirsiz adaylar
        döndürdüğünde) veya kullanıcı doğrudan bir egzersiz aramak istediğinde
        bu aracı çağır."""
        results = exercise_catalog_service.search_exercises(db, query)
        if not results:
            return "Katalogda bu aramaya uyan bir egzersiz bulunamadı."
        return "Bulunan egzersizler: " + ", ".join(row.name_tr for row in results)

    @tool
    def log_exercise_set(
        exercise_name: str,
        reps: int,
        weight_kg: float | None = None,
        workout_type: str | None = None,
    ) -> str:
        """Kullanıcının yaptığı BİR seti (egzersiz adı, tekrar sayısı, opsiyonel
        ağırlık) kaydeder. Kullanıcı '3x10 squat 60 kilo yaptım' gibi birden
        fazla set belirtirse bu aracı HER set için ayrı ayrı çağır — aynı gün
        içindeki setler otomatik olarak aynı antrenman oturumuna eklenir, set
        numarası kendiliğinden artar. Bu genel bilgi sorularında kullanılan
        search_exercise_knowledge ile KARIŞTIRMA — bu araç somut bir antrenman
        KAYDI içindir. workout_type belirtilmişse (kuvvet/kardiyo/esneklik/
        karışık) ilet."""
        match, score = exercise_catalog_service.best_match(db, exercise_name)
        catalog_id = (
            match.id if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD else None
        )

        if catalog_id is None:
            candidates = exercise_catalog_service.search_exercises(db, exercise_name, limit=3)
            if candidates:
                names = ", ".join(candidate.name_tr for candidate in candidates)
                return (
                    f"'{exercise_name}' katalogda net olarak bulunamadı. Kullanıcıya şunlardan "
                    f"birini mi kastettiğini sor: {names}. Netleşince tekrar çağır."
                )
            # Katalogda hiç yakın eşleşme yok; yine de kullanıcının verdiği isimle kaydet.

        try:
            workout_set = workout_service.log_single_set(
                db,
                user_id,
                exercise_name=exercise_name,
                reps=reps,
                weight_kg=weight_kg,
                exercise_catalog_id=catalog_id,
                workout_type=workout_type,
            )
        except ValueError as exc:
            return str(exc)

        return (
            f"Kaydedildi: {workout_set.exercise_name_snapshot}, set {workout_set.set_number}, "
            f"{workout_set.reps} tekrar"
            + (f", {workout_set.weight_kg} kg" if workout_set.weight_kg else "")
            + "."
        )

    @tool
    def get_workout_summary(days: int = 7) -> str:
        """Kullanıcının son `days` gündeki (varsayılan 7) detaylı antrenman
        özetini (set sayısı, hacim, en çok çalışılan egzersizler) döndürür.
        Kullanıcı 'bu hafta hangi egzersizleri yaptım' gibi bir şey sorduğunda
        bu aracı çağır."""
        return workout_service.generate_workout_summary(db, user_id, days=days).as_text()

    @tool
    def set_exercise_goal(exercise_name: str, target_weight_kg: float) -> str:
        """Kullanıcının belirli bir egzersizde ulaşmak istediği ağırlık
        hedefini kaydeder (ör. 'squat'ta 100 kiloya ulaşmak istiyorum' →
        exercise_name='squat', target_weight_kg=100). Aynı egzersiz için
        tekrar çağrılırsa hedef günceller. Kullanıcının antrenman geçmişindeki
        en iyi kaydıyla otomatik karşılaştırılıp ilerleme takip edilir."""
        match, score = exercise_catalog_service.best_match(db, exercise_name)
        catalog_id = (
            match.id if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD else None
        )
        try:
            goal = exercise_goal_service.set_exercise_goal(
                db, user_id, exercise_name=exercise_name, target_weight_kg=target_weight_kg, exercise_catalog_id=catalog_id
            )
        except ValueError as exc:
            return str(exc)
        return f"Hedef kaydedildi: {goal.exercise_name} — {goal.target_weight_kg} kg."

    @tool
    def get_exercise_goals() -> str:
        """Kullanıcının tüm egzersiz ağırlık hedeflerini ve mevcut
        ilerlemesini (antrenman geçmişindeki en iyi kayıtla karşılaştırmalı)
        döndürür. Kullanıcı 'hedeflerime ne kadar yaklaştım' gibi bir şey
        sorduğunda bu aracı çağır."""
        progress = exercise_goal_service.list_exercise_goal_progress(db, user_id)
        if not progress:
            return "Kullanıcının henüz kayıtlı bir egzersiz hedefi yok."
        parts = []
        for item in progress:
            best = f"{item.best_weight_kg} kg" if item.best_weight_kg is not None else "henüz kayıt yok"
            parts.append(f"{item.exercise_name}: hedef {item.target_weight_kg} kg, en iyi {best} (%{item.progress_pct:.0f})")
        return "; ".join(parts)

    return [
        search_exercise_catalog,
        log_exercise_set,
        get_workout_summary,
        set_exercise_goal,
        get_exercise_goals,
    ]
