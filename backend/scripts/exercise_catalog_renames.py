"""Egzersiz kataloğu Türkçe ad düzeltmeleri (2026-09-28 denetimi).

Adlar 2026-08'de LLM ile toplu çevrildi (translated_cache.json). Denetimde:
- "Decline" hareketler "Eğimli" diye çevrilmişti - incline hareketlerle AYNI ad
  ("Eğimli Şınav" iki farklı kayıt), kullanıcı hangisini yaptığını ayırt edemiyordu.
- anlamı tamamen yanlış olanlar: "Barbell Rollout from Bench" -> "Barbell ile
  Ayakta Baldır Kaldırma", "Dumbbell Shrug" -> "Dambıl Kürek Çekme", "Inverted Row
  with Straps" -> "Demir Haç" (Iron Cross ile aynı ad), "Keg Load" -> "Pelvik
  Taban Yüklemesi", olimpik "Clean" -> "Temizleme", "Flat Bench" -> "Yatar Akşam
  Sehpası", "Donkey" -> "Eşek Arısı";
- bozuk/uydurma: "Teker']]ı", "Rüzgarliğimi", "Skalpastik", "Skaptrasyon";
- salonda kullanılan adlar: "Bench Pres - Güç Kaldırma" -> "Barbell Bench Press",
  "Makine Sehpada Pres" -> "Makinede Göğüs Presi", upright row -> "Dik Çekiş".

Yeni adlar translated_cache.json'a da yazıldı (temiz kurulumda seed_catalogs.py
doğrudan yeni adları kullanır). Mevcut DB için bu betik katalog adını günceller
ve geçmiş setlerin/hedeflerin ESKİ ad kopyasını (exercise_name_snapshot /
exercise_name) yenisiyle değiştirir - antrenman geçmişi ve ilerleme ada göre
gruplandığı için (workout_service) aksi halde aynı hareket iki satıra bölünürdü.
İdempotent:
    python -m scripts.exercise_catalog_renames
"""

from app.db.session import SessionLocal
from app.models.exercise_catalog import ExerciseCatalog
from app.models.exercise_goal import ExerciseGoal
from app.models.workout_set import WorkoutSet
from app.services import exercise_catalog_service

# source_id -> (eski name_tr, yeni name_tr)
RENAMES: dict[str, tuple[str, str]] = {
    # Göğüs / bench
    "Bench_Press_-_Powerlifting": ("Bench Pres - Güç Kaldırma", "Barbell Bench Press"),
    "Barbell_Bench_Press_-_Medium_Grip": ("Orta Tutuşla Barbell Sehpası İtmesi", "Orta Tutuş Barbell Bench Press"),
    "Barbell_Incline_Bench_Press_-_Medium_Grip": ("Orta Tutuşla Eğimli Sehpası İtmesi", "Eğimli Barbell Bench Press"),
    "Barbell_Guillotine_Bench_Press": ("Barbell Gulyotin Sehpası İtmesi", "Barbell Giyotin Bench Press"),
    "Machine_Bench_Press": ("Makine Sehpada Pres", "Makinede Göğüs Presi"),
    "Alternating_Floor_Press": ("Alternatif Yer Sehpası İtmesi", "Alternatif Yer Presi (Floor Press)"),
    "One_Arm_Floor_Press": ("Tek Kollu Yer Sehpası İtme", "Tek Kollu Yer Presi (Floor Press)"),
    "Flat_Bench_Cable_Flyes": ("Yatar Akşam Sehpası Kablo Kelebek Açma", "Düz Sehpada Kablo Kanat Açma (Flyes)"),
    "Leverage_Incline_Chest_Press": ("Kaldıraç Eğik Göğüs Presi", "Kaldıraç Eğimli Göğüs Presi"),
    # Smith ailesi tek kalıpta: "...Sehpada Göğüs İtme" adı "smith makinesi eğimli göğüs presi"
    # sorgusunu decline kaydına kaydırıyordu (2026-09-28 eval).
    "Smith_Machine_Incline_Bench_Press": ("Smith Makinesi Eğimli Sehpada Göğüs İtme", "Smith Makinesi Eğimli Göğüs Presi"),
    "Smith_Machine_Bench_Press": ("Smith Makinesi Sehpada Göğüs İtme", "Smith Makinesi Göğüs Presi (Bench Press)"),
    "Smith_Machine_Close-Grip_Bench_Press": ("Smith Makinesi Dar Tutuş Sehpada Göğüs İtme", "Smith Makinesi Dar Tutuş Göğüs Presi"),
    # Decline: "Eğimli" incline'ın adıydı
    "Decline_Barbell_Bench_Press": ("Eğimli Sehpada Barbell Göğüs İtme", "Decline Barbell Bench Press"),
    "Decline_Close-Grip_Bench_To_Skull_Crusher": (
        "Eğimli Dar Tutuş Sehpa Skalpastik (Skull Crusher)",
        "Decline Dar Tutuş Bench Press ve Skull Crusher",
    ),
    "Decline_Crunch": ("Eğimli Crunch", "Decline Crunch"),
    "Decline_Dumbbell_Bench_Press": ("Eğimli Sehpada Dumbbell Göğüs İtme", "Decline Dambıl Bench Press"),
    "Decline_Dumbbell_Flyes": ("Eğimli Sehpada Dumbbell Kanat Açma (Flyes)", "Decline Dambıl Kanat Açma (Flyes)"),
    "Decline_Dumbbell_Triceps_Extension": ("Eğimli Sehpada Dumbbell Triseps Uzatma", "Decline Dambıl Triceps Uzatma"),
    "Decline_EZ_Bar_Triceps_Extension": ("Eğimli EZ Bar Triseps Uzatma", "Decline EZ Bar Triceps Uzatma"),
    "Decline_Oblique_Crunch": ("Eğimli Yan Karın (Oblik) Crunch", "Decline Yan Karın (Oblik) Crunch"),
    "Decline_Push-Up": ("Eğimli Şınav", "Decline Şınav (Ayaklar Yüksekte)"),
    "Decline_Reverse_Crunch": ("Eğimli Ters Crunch", "Decline Ters Crunch"),
    "Decline_Smith_Press": ("Eğimli Smith Makinesi İtme", "Decline Smith Makinesi Pres"),
    "Leverage_Decline_Chest_Press": ("Kaldıraç Eğimli Göğüs Presi", "Kaldıraç Decline Göğüs Presi"),
    "Smith_Machine_Decline_Press": ("Smith Makinesi Ayaklı (Decline) Göğüs İtme", "Smith Makinesi Decline Göğüs Presi"),
    "Wide-Grip_Decline_Barbell_Bench_Press": (
        "Geniş Tutuş Eğimli (Decline) Barbell Sehpada Pres",
        "Geniş Tutuş Decline Barbell Bench Press",
    ),
    "Wide-Grip_Decline_Barbell_Pullover": ("Geniş Tutuş Lat Barbell Pullover", "Geniş Tutuş Decline Barbell Pullover"),
    # Omuz
    "Machine_Shoulder_Military_Press": ("Makine Omuz (Askeri) Pres", "Makinede Omuz Presi"),
    "Cable_Rear_Delt_Fly": ("Kablo Arka Deltoid Uçuşu", "Kablo Arka Omuz Açış (Rear Delt Fly)"),
    "Sled_Reverse_Flye": ("Kızak Ters Uçuş (Flye)", "Kızakla Ters Kanat Açma (Reverse Flye)"),
    "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench": (
        "Bench Üzerinde Başla Dumbbell Arka Deltoid Kaldırma",
        "Başı Sehpaya Dayalı Dambıl Arka Omuz Kaldırma",
    ),
    "Bent_Over_Low-Pulley_Side_Lateral": ("Eğilerek Düşük Makaralı Yan Lateral Hareket", "Eğilerek Alçak Makaradan Yana Açış"),
    "Dumbbell_Scaption": ("Dambıl Skaptrasyon", "Dambıl Skapsiyon (Scaption)"),
    "Standing_Palm-In_One-Arm_Dumbbell_Press": (
        "Ayakta Avuç İçi Yukarı Tek Kollu Dumbbell Pres",
        "Ayakta Nötr Tutuş Tek Kollu Dambıl Pres",
    ),
    "Standing_Palms-In_Dumbbell_Press": ("Ayakta Avuç İçleri Yukarı Dumbbell Pres", "Ayakta Nötr Tutuş Dambıl Pres"),
    "Dumbbell_Shrug": ("Dambıl Kürek Çekme (Shrug)", "Dambıl Omuz Silkme (Shrug)"),
    "Smith_Machine_Behind_the_Back_Shrug": (
        "Smith Makinesi Arka Boyun Silkintisi (Shrug)",
        "Smith Makinesi Arkadan Omuz Silkme (Shrug)",
    ),
    # Upright row: "kürek çekme" değil dik çekiş
    "Standing_Dumbbell_Upright_Row": ("Ayakta Dumbbell Yüksek Row (Kürek Çekme)", "Ayakta Dambıl Dik Çekiş (Upright Row)"),
    "Upright_Barbell_Row": ("Dik Barbell Kürek Çekme", "Barbell Dik Çekiş (Upright Row)"),
    "Upright_Cable_Row": ("Dik Kablo Kürek Çekme", "Kablo Dik Çekiş (Upright Row)"),
    "Upright_Row_-_With_Bands": ("Bantlarla Dik Kaldırma (Row)", "Bantla Dik Çekiş (Upright Row)"),
    "Dumbbell_One-Arm_Upright_Row": ("Tek Kol Dik Kaldırma (Dambıl)", "Tek Kol Dambıl Dik Çekiş (Upright Row)"),
    # Sırt
    "Inverted_Row_with_Straps": ("Demir Haç", "Askılı Ters Kürek Çekiş (Inverted Row)"),
    "Leverage_High_Row": ("Kaldıraç Yüksek Sıra Çekişi", "Kaldıraç Yüksek Kürek Çekme (High Row)"),
    "Leverage_Iso_Row": ("Kaldıraç İzometrik Sıra Çekişi", "Kaldıraç Kürek Çekme (Iso Row)"),
    "Low_Pulley_Row_To_Neck": ("Alçak Makaradan Boyuna Sıra Çekişi", "Alçak Makaradan Boyna Doğru Kürek Çekme"),
    "Lying_Cambered_Barbell_Row": ("Yatarak Eğik Barbell Sıra Çekişi", "Yüzüstü Kavisli Barbell Kürek Çekme"),
    "Lying_T-Bar_Row": ("Yatarak T-Bar Sıra Çekişi", "Yüzüstü T-Bar Kürek Çekme"),
    "Shotgun_Row": ("Şok Tüfeği Kürek Çekme", "Shotgun Row (Tek Kol Kablo Kürek)"),
    "Chin-Up": ("Barfiks (Çene Seviyesinde)", "Chin-Up (Ters Tutuş Barfiks)"),
    "Side_To_Side_Chins": ("Yandan Yana Barfiks (Çinler)", "Yandan Yana Barfiks"),
    "Muscle_Up": ("Kas Yükselişi", "Muscle Up"),
    "Pull_Through": ("Çekiş (İtme/Germe Hareketleri)", "Kablo Pull Through (Kalça Menteşesi)"),
    # Kol
    "Cable_Preacher_Curl": ("Kablo Paşa Kürek (Preacher) Kıvırma", "Kablo Preacher Curl"),
    "Drag_Curl": ("Sürükleme Kıvırma", "Drag Curl (Sürükleme Curl)"),
    "Dips_-_Triceps_Version": ("Dips (Triceps Odaklı)", "Triceps Odaklı Dips"),
    "Speed_Band_Overhead_Triceps": ("Hız Bandı Üst Triceps", "Bantla Hızlı Baş Üstü Triceps Uzatma"),
    "Overhead_Triceps": ("Omuz Üstü Triceps Uzatma", "Baş Üstü Triceps Germe"),
    "Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl": (
        "Ayakta Avuç İçleri Aşağı Barbell Arkada Bilek Bükme",
        "Ayakta Arkadan Barbell Bilek Bükme (Avuç İçi Yukarı)",
    ),
    "Wrist_Roller": ("Bilek Roller'ı", "Bilek Rulosu (Wrist Roller)"),
    # Bacak / kalça
    "Donkey_Calf_Raises": ("Eşek Arısı Baldır Kaldırma", "Eşek Baldır Kaldırma (Donkey Calf Raise)"),
    "Flat_Bench_Leg_Pull-In": ("Yatar Akşam Sehpası Bacak Çekişi", "Düz Sehpada Bacak Çekme (Leg Pull-In)"),
    "Prone_Manual_Hamstring": ("Piyin (Yüksek Diz Çekme)", "Partnerle Yüzüstü Hamstring Curl"),
    "Trap_Bar_Deadlift": ("Tuzak Çubuğu (Trap Bar) Kaldırış", "Trap Bar Deadlift"),
    "One-Arm_Side_Deadlift": ("Tek Kol Yan Kaldırma", "Tek Kol Yan Deadlift"),
    "Kettlebell_Pistol_Squat": ("Kettlebell Pisto Squat", "Kettlebell Pistol Squat"),
    "Kettlebell_Thruster": ("Kettlebell Trüster", "Kettlebell Thruster"),
    # Karın
    "Barbell_Ab_Rollout": ("Barbell Mekik Teker']]ı Açma", "Barbell ile Karın Tekerleği (Ab Rollout)"),
    "Barbell_Ab_Rollout_-_On_Knees": (
        "Diz Üzerinde Barbell Mekik Teker']]ı Açma",
        "Dizler Üzerinde Barbell ile Karın Tekerleği (Ab Rollout)",
    ),
    "Barbell_Rollout_from_Bench": ("Barbell ile Ayakta Baldır Kaldırma", "Sehpadan Barbell ile Karın Tekerleği (Rollout)"),
    "Crunches": ("Crunch (Karın Bisikleti)", "Crunch (Yarım Mekik)"),
    "Flat_Bench_Lying_Leg_Raise": ("Yatar Akşam Sehpası Yatar Bacak Kaldırma", "Düz Sehpada Yatarak Bacak Kaldırma"),
    # Kettlebell / yel değirmeni
    "Advanced_Kettlebell_Windmill": ("Gelişmiş Kettlebell Rüzgarliğimi", "İleri Seviye Kettlebell Yel Değirmeni (Windmill)"),
    "Double_Kettlebell_Windmill": ("Çift Kettlebell Rüzgarli Değneği (Windmill)", "Çift Kettlebell Yel Değirmeni (Windmill)"),
    "Kettlebell_Windmill": ("Kettlebell Rüzgar Değirmeni", "Kettlebell Yel Değirmeni (Windmill)"),
    "Windmills": ("Türbin Hareketleri", "Yel Değirmeni Germe (Windmills)"),
    # Olimpik kaldırışlar: "Clean" -> "Temizleme" (ev temizliği) yanlış; salonda İngilizce adıyla
    "Clean": ("Temizleme", "Clean"),
    "Clean_Deadlift": ("Temiz Kaldırış Ölü Kaldırışı", "Clean Deadlift"),
    "Clean_Pull": ("Temiz Çekiş", "Clean Pull"),
    "Clean_Shrug": ("Temiz Omuz Silkme", "Clean Shrug"),
    "Clean_and_Jerk": ("Temiz ve Atılma (Clean and Jerk)", "Clean and Jerk (Silkme)"),
    "Clean_and_Press": ("Temiz ve Presleme (Clean and Press)", "Clean and Press"),
    "Clean_from_Blocks": ("Bloklardan Temiz Kaldırma", "Bloklardan Clean"),
    "Alternating_Hang_Clean": ("Alternatif Asılı Temizleme", "Alternatif Hang Clean"),
    "Hang_Clean": ("Asılı Temizleme (Hang Clean)", "Hang Clean"),
    "Hang_Clean_-_Below_the_Knees": ("Diz Altında Asılı Temizleme", "Diz Altından Hang Clean"),
    "Hang_Snatch": ("Asılı Baş Atma (Hang Snatch)", "Hang Snatch"),
    "Hang_Snatch_-_Below_Knees": ("Diz Altında Asılı Baş Atma", "Diz Altından Hang Snatch"),
    "Power_Clean": ("Güç Temizlemesi (Power Clean)", "Power Clean"),
    "Power_Clean_from_Blocks": ("Bloklardan Güç Temizlemesi", "Bloklardan Power Clean"),
    "Power_Jerk": ("Güç Atlaması (Power Jerk)", "Power Jerk"),
    "Power_Snatch": ("Güç Yakalama (Power Snatch)", "Power Snatch"),
    "Power_Snatch_from_Blocks": ("Bloklardan Güç Yakalaması", "Bloklardan Power Snatch"),
    "Muscle_Snatch": ("Kas Sıçraması", "Muscle Snatch"),
    "Smith_Machine_Hang_Power_Clean": ("Smith Makinesi Asılı Güç Temizlemesi", "Smith Makinesi Hang Power Clean"),
    "Dumbbell_Clean": ("Dambıl Temizleme (Clean)", "Dambıl Clean"),
    "Kettlebell_Dead_Clean": ("Kettlebell Ölü Temizleme (Dead Clean)", "Kettlebell Dead Clean"),
    "Double_Kettlebell_Alternating_Hang_Clean": (
        "Çift Kettlebell Alternatif Askı Temizlemesi",
        "Çift Kettlebell Alternatif Hang Clean",
    ),
    "One-Arm_Kettlebell_Clean": ("Tek Kol Kettlebell Temizleme", "Tek Kol Kettlebell Clean"),
    "One-Arm_Kettlebell_Clean_and_Jerk": ("Tek Kol Kettlebell Temizle ve Atış", "Tek Kol Kettlebell Clean and Jerk"),
    "One-Arm_Open_Palm_Kettlebell_Clean": ("Tek Kol Açık Avuç Kettlebell Temizlemesi", "Tek Kol Açık Avuç Kettlebell Clean"),
    "Open_Palm_Kettlebell_Clean": ("Açık Avuç Kettlebell Temizleme", "Açık Avuç Kettlebell Clean"),
    "Two-Arm_Kettlebell_Clean": ("İki Kollu Kettlebell Temizleme (Clean)", "İki Kollu Kettlebell Clean"),
    # Kardiyo: iki kayıt "Koşu Bandında Koşma" idi
    "Jogging_Treadmill": ("Koşu Bandında Koşma", "Koşu Bandında Hafif Koşu (Jogging)"),
    "Rowing_Stationary": ("Kürek Çekme, Sabit Konumda", "Kürek Makinesi (Ergometre)"),
    "Prowler_Sprint": ("Gezgin Koşusu (Sprint)", "Prowler Sprint (Kızak İtme)"),
    # Strongman / esneme
    "Keg_Load": ("Pelvik Taban Yüklemesi", "Fıçı Yükleme (Keg Load)"),
    "Rickshaw_Carry": ("Tricycle Taşıma (Rickshaw Carry)", "Rikşa Taşıma (Rickshaw Carry)"),
    "Rickshaw_Deadlift": ("Tricycle Deadlift", "Rikşa Deadlift"),
    "Elbows_Back": ("Yükseltilmiş Arka Hamleme", "Dirsekler Geride Germe (Elbows Back)"),
    "One_Half_Locust": ("Yarım Lokost", "Yarım Çekirge Duruşu (Half Locust)"),
    "Pyramid": ("Piramit Tekrarı", "Piramit Duruşu (Germe)"),
    "Anterior_Tibialis-SMR": ("Ön Tibialis-SMR (Sinir Mobilizasyonu)", "Ön Tibialis - SMR (Köpük Rulo)"),
}


def apply_renames(db) -> tuple[int, int, int]:
    """(katalog, set, hedef) güncellenen satır sayısı."""
    catalog_count = set_count = goal_count = 0
    for source_id, (old_name, new_name) in RENAMES.items():
        row = db.query(ExerciseCatalog).filter(ExerciseCatalog.source_id == source_id).one_or_none()
        if row is None:
            continue
        if row.name_tr != new_name:
            row.name_tr = new_name
            catalog_count += 1
        set_count += (
            db.query(WorkoutSet)
            .filter(WorkoutSet.exercise_catalog_id == row.id, WorkoutSet.exercise_name_snapshot == old_name)
            .update({WorkoutSet.exercise_name_snapshot: new_name}, synchronize_session=False)
        )
        goal_count += (
            db.query(ExerciseGoal)
            .filter(ExerciseGoal.exercise_catalog_id == row.id, ExerciseGoal.exercise_name == old_name)
            .update({ExerciseGoal.exercise_name: new_name}, synchronize_session=False)
        )
    db.commit()
    exercise_catalog_service.invalidate_cache()
    return catalog_count, set_count, goal_count


if __name__ == "__main__":
    session = SessionLocal()
    try:
        catalog, sets, goals = apply_renames(session)
    finally:
        session.close()
    print(f"[exercise_catalog] {catalog} ad, {sets} set, {goals} hedef güncellendi")
