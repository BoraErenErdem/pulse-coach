"""Kullanıcı girdisi için fiziksel üst sınırlar (2026-09-23 denetimi) - hiçbir
app modülüne bağımlı DEĞİL: hem workout_service hem exercise_goal_service
kullanıyor, ikisi arasında notification_service üzerinden zaten bir import
zinciri var (workout_service -> notification_service -> exercise_goal_service),
sabitleri workout_service'ten import etmek döngüsel import hatası veriyordu."""

# Tek bir set/hedef - bacak presinde toplam yük ~1000 kg'a çıkabiliyor.
MAX_SET_WEIGHT_KG = 1000.0
MAX_SET_REPS = 1000
MAX_SET_DURATION_MINUTES = 24 * 60
# Tek bir öğün kaydı.
MAX_QUANTITY_GRAMS = 5000
# Profil metin alanları (2026-09-25): hassasiyet/kısıtlama notu koça bağlam
# olarak gidiyor - sınırsız metin hem prompt'u şişirir hem de DB'yi.
MAX_DIETARY_RESTRICTIONS_LENGTH = 300
MAX_DISPLAY_NAME_LENGTH = 40
