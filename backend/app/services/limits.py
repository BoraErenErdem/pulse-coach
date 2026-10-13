"""Kullanıcı girdisi için fiziksel üst sınırlar (2026-09-23 denetimi) - hiçbir
app modülüne bağımlı DEĞİL: hem workout_service hem exercise_goal_service
kullanıyor; sabitler tek yerde, iki servis birbirine bağımlı olmadan okuyor."""

# Tek bir set/hedef - bacak presinde toplam yük ~1000 kg'a çıkabiliyor.
MAX_SET_WEIGHT_KG = 1000.0
MAX_SET_REPS = 1000
MAX_SET_DURATION_MINUTES = 24 * 60
# Serbest metin (2026-10-13 canlı test): egzersiz adı ve oturum notu sınırsızdı -
# 200 bin karakter kabul ediliyor, uzun not sayfayı yatay taşırıyordu. Katalogdaki
# en uzun egzersiz adı 65 karakter.
MAX_EXERCISE_NAME_LENGTH = 120
MAX_WORKOUT_NOTE_LENGTH = 300
MAX_SETS_PER_REQUEST = 200
# Katalog araması: en uzun besin adı 186 karakter.
MAX_SEARCH_QUERY_LENGTH = 200
# Tek bir öğün kaydı.
MAX_QUANTITY_GRAMS = 5000
# Profil metin alanları (2026-09-25): hassasiyet/kısıtlama notu koça bağlam
# olarak gidiyor - sınırsız metin hem prompt'u şişirir hem de DB'yi.
MAX_DIETARY_RESTRICTIONS_LENGTH = 300
MAX_DISPLAY_NAME_LENGTH = 40
# Vücut bilgileri (2026-09-26): kayıtlı en kısa/uzun yetişkin boyu aralığı;
# uygulama 18 yaş altına kapalı (KVKK metni 1.10).
MIN_HEIGHT_CM = 50
MAX_HEIGHT_CM = 272
MIN_AGE_YEARS = 18
MAX_AGE_YEARS = 120
