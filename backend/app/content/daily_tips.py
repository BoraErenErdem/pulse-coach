"""Günlük mikro-ipucu içerik havuzu.

Sağlık/beslenme/spor ipuçları backend/knowledge_base/ altındaki (WHO, ISSN,
NSCA, Sleep Foundation, CDC, USDA gibi kaynaklardan kendi cümleleriyle
sentezlenmiş) bilgi tabanı dosyalarından türetilmiş, kısa ve tek başına
anlaşılır hale getirilmiş özetlerdir — verbatim kopya değildir (bkz. proje
belleğindeki "Copyright-Safe Knowledge Base" kararı, aynı ilke burada da
uygulanıyor). Ruh hali / yaşam koçluğu / genel yaşam ipuçları, sayısal bir
iddia içermeyen (kaynak gerektirmeyen) genel iyi-yaşam pratikleridir.

Faz 2 takip (2026-08-08): her ipucu artık TR+EN çifti olarak tutuluyor -
kendi sentezimiz olduğu için (verbatim alıntı değil) İngilizce çevirisi
copyright açısından sorunsuz, RAG'ın Türkçe-kalması kuralından farklı bir
konu (bu içerik chat'in DIŞINDA, sadece bir UI banner'ı).
"""

import random

# İç kategori anahtarları (kararlı, ASLA değişmemeli - CATEGORY_ICONS ve
# CATEGORY_LABELS bunlara göre eşleniyor). Kullanıcıya gösterilen etiket
# CATEGORY_LABELS[language][key]'den geliyor.
CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "tr": {
        "beslenme": "Beslenme",
        "spor": "Spor",
        "saglik": "Sağlık",
        "ruh_hali": "Ruh Hali",
        "yasam_koclugu": "Yaşam Koçluğu",
        "yasam": "Yaşam",
    },
    "en": {
        "beslenme": "Nutrition",
        "spor": "Fitness",
        "saglik": "Health",
        "ruh_hali": "Mood",
        "yasam_koclugu": "Life Coaching",
        "yasam": "Life",
    },
}

CATEGORY_ICONS: dict[str, str] = {
    "beslenme": "🍎",
    "spor": "🏋️",
    "saglik": "💚",
    "ruh_hali": "🧘",
    "yasam_koclugu": "🎯",
    "yasam": "🌿",
}

# Her ipucu (kategori_anahtarı, tr_metin, en_metin) üçlüsü.
DAILY_TIPS: list[tuple[str, str, str]] = [
    # --- Beslenme / Nutrition ---
    (
        "beslenme",
        "Düzenli egzersiz yapan biri için günlük protein ihtiyacı, hareketsiz bir bireye göre belirgin şekilde daha yüksektir — genel aralık kilogram başına 1.4-2.0 gramdır. (ISSN, 2017)",
        "Daily protein needs for someone who exercises regularly are noticeably higher than for a sedentary person — the general range is 1.4-2.0 grams per kilogram of body weight. (ISSN, 2017)",
    ),
    (
        "beslenme",
        "Kas protein sentezini desteklemek için tek öğünde yaklaşık 20-40 gram kaliteli protein almak yeterli kabul edilir; bunu gün içindeki öğünlere yaymak faydalı olabilir. (ISSN, 2017)",
        "Getting about 20-40 grams of quality protein in a single meal is generally considered enough to support muscle protein synthesis; spreading this across meals throughout the day can be helpful. (ISSN, 2017)",
    ),
    (
        "beslenme",
        "Protein ihtiyacını sadece etten değil, baklagiller, yumurta, süt ürünleri ve kuruyemiş gibi çeşitli kaynaklardan karşılamak mümkündür. (ISSN, 2017)",
        "You can meet your protein needs not just from meat, but from a variety of sources like legumes, eggs, dairy, and nuts. (ISSN, 2017)",
    ),
    (
        "beslenme",
        "Kompleks karbonhidratlar (tam tahıl, sebze, baklagil) rafine şekere göre kan şekerini daha yavaş yükseltir ve daha uzun tokluk sağlar. (USDA temelli)",
        "Complex carbohydrates (whole grains, vegetables, legumes) raise blood sugar more slowly than refined sugar and keep you fuller for longer. (Based on USDA)",
    ),
    (
        "beslenme",
        "Yağ sadece enerji deposu değil, A, D, E, K vitaminlerinin emilimi için de gereklidir — çok düşük yağlı beslenmek bu vitaminlerin emilimini zorlaştırabilir. (USDA temelli)",
        "Fat isn't just an energy store — it's also needed to absorb vitamins A, D, E, and K, so a very low-fat diet can make absorbing these vitamins harder. (Based on USDA)",
    ),
    (
        "beslenme",
        "Kilo verme hedefi kalori açığı, kilo koruma enerji dengesi, kas/kilo alma ise yeterli proteinle desteklenen küçük bir kalori fazlası gerektirir. (Genel beslenme bilimi)",
        "A weight-loss goal needs a calorie deficit, weight maintenance needs energy balance, and gaining muscle/weight needs a small calorie surplus backed by enough protein. (General nutrition science)",
    ),
    (
        "beslenme",
        "Yemeğini yavaş yiyip her lokmanın tadını çıkarmak (bilinçli/mindful yeme), tokluk sinyallerini daha iyi fark etmene yardımcı olabilir.",
        "Eating slowly and savoring each bite (mindful eating) can help you notice your body's fullness signals better.",
    ),
    (
        "beslenme",
        "Haftalık öğün planlaması yapmak, günün yoğun anlarında sağlıksız/hazır seçeneklere yönelme ihtimalini azaltabilir.",
        "Planning your meals for the week can lower the chances of reaching for unhealthy/convenience options during busy moments.",
    ),
    # --- Spor / Fitness ---
    (
        "spor",
        "Kademeli aşırı yüklenme (progressive overload) ilkesine göre vücut aynı yüke alıştıkça gelişim durur — ilerlemeyi sürdürmek için ağırlığı, tekrarı ya da hacmi zamanla artırmak gerekir. (NSCA)",
        "Under the principle of progressive overload, your body's progress stalls once it adapts to the same load — you need to increase weight, reps, or volume over time to keep improving. (NSCA)",
    ),
    (
        "spor",
        "Kas gelişimi için tek yol 'daha ağır kaldırmak' değildir — geniş bir tekrar aralığında (5-30 tekrar) sete yeterli çabayla gitmek de benzer sonuçlar verebilir. (NSCA)",
        "'Lifting heavier' isn't the only path to muscle growth — training with enough effort across a wide rep range (5-30 reps) can produce similar results. (NSCA)",
    ),
    (
        "spor",
        "Aynı kas grubuna yönelik yüksek yoğunluklu antrenmanlar arasında en az 48 saat dinlenmek, toparlanma ve sakatlanma riski açısından genel bir öneridir. (NSCA)",
        "Resting at least 48 hours between high-intensity workouts targeting the same muscle group is a general recommendation for recovery and injury-risk reasons. (NSCA)",
    ),
    (
        "spor",
        "Antrenman öncesi 5-10 dakikalık hafif/dinamik bir ısınma, kalp atışını ve kas sıcaklığını kademeli artırarak sakatlanma riskini azaltır. (CDC temelli)",
        "A 5-10 minute light/dynamic warm-up before training gradually raises heart rate and muscle temperature, lowering injury risk. (Based on CDC)",
    ),
    (
        "spor",
        "Uzun süreli statik esneme antrenman ÖNCESİNDE değil, kaslar hâlâ ısınmışken antrenman SONRASINDA (soğuma bölümünde) yapılırsa daha faydalıdır. (CDC temelli)",
        "Long static stretching is more beneficial AFTER training (during the cool-down), while muscles are still warm, rather than BEFORE. (Based on CDC)",
    ),
    (
        "spor",
        "Yetişkinler için haftada 150-300 dakika orta yoğunlukta ya da 75-150 dakika yüksek yoğunlukta aerobik aktivite öneriliyor — bu ikisinin bir kombinasyonu da işe yarar. (WHO, 2020)",
        "Adults are recommended to get 150-300 minutes of moderate-intensity, or 75-150 minutes of high-intensity, aerobic activity per week — a combination of the two also works. (WHO, 2020)",
    ),
    (
        "spor",
        "Aerobik aktivitenin yanında haftada en az 2 gün, ana kas gruplarını çalıştıran kuvvet egzersizi yapmak ek sağlık faydası sağlıyor. (WHO, 2020)",
        "Alongside aerobic activity, doing strength exercises that work the major muscle groups at least 2 days a week provides additional health benefits. (WHO, 2020)",
    ),
    (
        "spor",
        "Hiç hareket etmemekten iyidir: önerilen miktarları tam karşılamasan bile her fiziksel aktivite bir katkı sağlar — küçük başlayıp zamanla artırabilirsin. (WHO, 2020)",
        "Something is better than nothing: even if you don't fully meet the recommended amounts, any physical activity helps — you can start small and build up over time. (WHO, 2020)",
    ),
    # --- Sağlık / Health ---
    (
        "saglik",
        "Günlük su ihtiyacın iklime, aktivite düzeyine ve genel sağlığına göre değişir; kadınlarda ortalama 2-2.7 litre, erkeklerde 2.5-3.7 litre civarı sıkça referans alınan bir aralıktır (yiyeceklerden gelen su dahil). (Genel beslenme bilimi)",
        "Your daily water needs vary by climate, activity level, and overall health; a commonly referenced range is about 2-2.7 liters for women and 2.5-3.7 liters for men (including water from food). (General nutrition science)",
    ),
    (
        "saglik",
        "Hafif susuzluk bile yorgunluk ve konsantrasyon güçlüğüne yol açabilir — idrar renginin açık sarı olması genelde yeterli hidrasyonun bir işaretidir. (Genel beslenme bilimi)",
        "Even mild dehydration can cause fatigue and trouble concentrating — pale yellow urine color is generally a sign of adequate hydration. (General nutrition science)",
    ),
    (
        "saglik",
        "Uzun süre oturmak (masa başı iş, ekran süresi) kalp-damar ve metabolik sağlık açısından risk taşır — saatte birkaç dakika kalkıp yürümek bile fark yaratabilir. (WHO, 2020)",
        "Long periods of sitting (desk work, screen time) carry cardiovascular and metabolic health risks — even standing and walking for a few minutes each hour can make a difference. (WHO, 2020)",
    ),
    (
        "saglik",
        "Yetişkinler için genel uyku önerisi gecede 7-9 saattir; yoğun antrenman yapanlarda bu ihtiyaç 9-10 saate kadar çıkabilir. (Sleep Foundation)",
        "The general sleep recommendation for adults is 7-9 hours a night; this need can rise to 9-10 hours for those training intensely. (Sleep Foundation)",
    ),
    (
        "saglik",
        "Uyku kısaldığında kas gücü, reaksiyon süresi ve odaklanma olumsuz etkilenir — antrenman performansı düşüyorsa önce uyku düzenini gözden geçirmek iyi bir başlangıç noktasıdır. (Sleep Foundation)",
        "Shortened sleep negatively affects muscle strength, reaction time, and focus — if workout performance is dropping, reviewing your sleep routine first is a good starting point. (Sleep Foundation)",
    ),
    (
        "saglik",
        "Derin uyku evresinde salgılanan büyüme hormonu kas onarımı ve toparlanma için kritik önemdedir — yetersiz uyku, kazandığın antrenman gelişimini yavaşlatabilir. (Sleep Foundation)",
        "Growth hormone released during deep sleep is critical for muscle repair and recovery — insufficient sleep can slow down the training progress you've gained. (Sleep Foundation)",
    ),
    (
        "saglik",
        "Uzun süre ekrana bakarken göz yorgunluğunu azaltmak için 20-20-20 kuralı denenebilir: her 20 dakikada bir, 20 saniye boyunca ~6 metre uzaktaki bir noktaya bakmak.",
        "To reduce eye strain during long screen time, try the 20-20-20 rule: every 20 minutes, look at something about 6 meters (20 feet) away for 20 seconds.",
    ),
    (
        "saglik",
        "Düzenli sağlık kontrolleri (tansiyon, rutin kan tahlilleri gibi), risk faktörlerini belirti vermeden önce fark etmenin en etkili yollarından biridir.",
        "Regular health checkups (blood pressure, routine blood tests, etc.) are one of the most effective ways to catch risk factors before they show symptoms.",
    ),
    # --- Ruh Hali / Mood ---
    (
        "ruh_hali",
        "Günde birkaç dakika şükran duyduğun 3 şeyi yazmak (şükran günlüğü), ruh halini olumlu yönde etkileyebilecek basit ve ücretsiz bir alışkanlıktır.",
        "Writing down 3 things you're grateful for each day (a gratitude journal) is a simple, free habit that can positively affect your mood.",
    ),
    (
        "ruh_hali",
        "Derin, yavaş nefes almak (ör. 4 saniye nefes al, 4 saniye tut, 4 saniye ver) sinir sistemini sakinleştirip anlık stresi azaltmaya yardımcı olabilir.",
        "Deep, slow breathing (e.g. inhale for 4 seconds, hold for 4, exhale for 4) can help calm your nervous system and reduce momentary stress.",
    ),
    (
        "ruh_hali",
        "Doğada (park, yeşil alan) geçirilen kısa zaman dilimleri bile ruh hali ve odaklanma üzerinde olumlu etkiler gösterebilir.",
        "Even short amounts of time spent in nature (a park, green space) can have positive effects on mood and focus.",
    ),
    (
        "ruh_hali",
        "Sosyal bağlantı, ruh sağlığını destekleyen en güçlü faktörlerden biridir — yalnız hissettiğinde bir yakınına mesaj atmak küçük ama etkili bir adım olabilir.",
        "Social connection is one of the strongest factors supporting mental health — when you feel lonely, sending a message to someone close to you can be a small but effective step.",
    ),
    (
        "ruh_hali",
        "Kendine karşı eleştirel değil şefkatli konuşmak, zorlandığın anlarda bir yakınına gösterdiğin anlayışı kendine de göstermekten geçebilir.",
        "Speaking to yourself with compassion instead of criticism can mean showing yourself the same understanding you'd show a close friend when they're struggling.",
    ),
    (
        "ruh_hali",
        "Sosyal medyada/haberlerde geçirilen süreyi bilinçli olarak sınırlamak, özellikle yatmadan önce, kaygı düzeyini azaltabilir.",
        "Consciously limiting time spent on social media/news, especially before bed, can lower anxiety levels.",
    ),
    (
        "ruh_hali",
        "Duygularını bastırmak yerine isimlendirmek ('şu an gergin hissediyorum' demek gibi) onları daha yönetilebilir hale getirebilir.",
        "Naming your emotions instead of suppressing them (like saying \"I'm feeling tense right now\") can make them more manageable.",
    ),
    (
        "ruh_hali",
        "Küçük, ulaşılabilir bir hedefi tamamlamak bile motivasyon hissini tetikleyebilir — büyük bir günü küçük adımlara bölmek bunalmışlık hissini azaltabilir.",
        "Completing even a small, achievable goal can trigger a feeling of motivation — breaking a big day into small steps can reduce the feeling of being overwhelmed.",
    ),
    # --- Yaşam Koçluğu / Life Coaching ---
    (
        "yasam_koclugu",
        "Net olmayan hedefler yerine SMART (Spesifik, Ölçülebilir, Ulaşılabilir, İlgili, Zamana bağlı) hedefler belirlemek ilerlemeyi takip etmeyi kolaylaştırır.",
        "Setting SMART (Specific, Measurable, Achievable, Relevant, Time-bound) goals instead of vague ones makes it easier to track progress.",
    ),
    (
        "yasam_koclugu",
        "Yeni bir alışkanlığı zaten var olan bir alışkanlığa eklemek ('alışkanlık istifleme' — ör. 'diş fırçaladıktan sonra 5 dakika esneme yaparım') yeni rutinleri kalıcı hale getirmede etkili bir yöntemdir.",
        "Attaching a new habit to an existing one ('habit stacking' — e.g. 'I'll stretch for 5 minutes after brushing my teeth') is an effective way to make new routines stick.",
    ),
    (
        "yasam_koclugu",
        "Büyük bir hedefe odaklanmak yerine sürece/günlük tutarlılığa odaklanmak, uzun vadede motivasyonu korumada genelde daha etkilidir.",
        "Focusing on the process/daily consistency instead of a big goal is generally more effective for sustaining motivation in the long run.",
    ),
    (
        "yasam_koclugu",
        "Küçük ilerlemeleri fark edip kutlamak (bir haftalık antrenman serisi, bir hedefe biraz daha yaklaşmak gibi) motivasyonu besleyen basit ama gözden kaçan bir adımdır.",
        "Noticing and celebrating small progress (like a week-long workout streak, or getting a bit closer to a goal) is a simple but often-overlooked step that fuels motivation.",
    ),
    (
        "yasam_koclugu",
        "Zamanını bloklar halinde planlamak (time-blocking) — belirli işler için belirli saatler ayırmak — dağınık bir günü daha yönetilebilir hale getirebilir.",
        "Planning your time in blocks (time-blocking) — setting aside specific hours for specific tasks — can make a scattered day more manageable.",
    ),
    (
        "yasam_koclugu",
        "'Hayır' demeyi öğrenmek, zamanını ve enerjini gerçekten önemli olan hedeflere ayırabilmenin bir parçasıdır.",
        "Learning to say 'no' is part of being able to devote your time and energy to the goals that truly matter.",
    ),
    (
        "yasam_koclugu",
        "Günü net bir sabah rutiniyle başlatmak (su içmek, birkaç dakika hareket etmek, önceliklerini gözden geçirmek gibi) günün geri kalanına olumlu bir ivme kazandırabilir.",
        "Starting the day with a clear morning routine (drinking water, moving for a few minutes, reviewing your priorities) can give the rest of your day positive momentum.",
    ),
    (
        "yasam_koclugu",
        "İlerlemeni yazılı olarak takip etmek sadece motive etmekle kalmaz, nelerin senin için işe yaradığını görmeni de sağlar.",
        "Tracking your progress in writing doesn't just motivate you — it also lets you see what's actually working for you.",
    ),
    # --- Yaşam / Life ---
    (
        "yasam",
        "Çalışma ve dinlenme arasında net bir sınır çizmek (ör. iş bittiğinde bilgisayarı kapatmak) uzun vadede tükenmişliği önlemeye yardımcı olabilir.",
        "Drawing a clear line between work and rest (e.g. shutting down your computer when work ends) can help prevent burnout in the long run.",
    ),
    (
        "yasam",
        "Yatmadan önce ekran süresini azaltmak sadece uyku kalitesini değil, genel ruh halini de olumlu etkileyebilir.",
        "Reducing screen time before bed can positively affect not just sleep quality but overall mood too.",
    ),
    (
        "yasam",
        "Düzenli, küçük molalar (ör. her saat başı birkaç dakika kalkıp gerinmek) uzun oturma periyotlarının olumsuz etkilerini azaltabilir.",
        "Regular, small breaks (e.g. standing and stretching for a few minutes every hour) can reduce the negative effects of long sitting periods.",
    ),
    (
        "yasam",
        "Fiziksel ortamını (masan, odan) düzenli tutmak, zihinsel netlik üzerinde şaşırtıcı derecede olumlu bir etkiye sahip olabilir.",
        "Keeping your physical space (desk, room) tidy can have a surprisingly positive effect on mental clarity.",
    ),
    (
        "yasam",
        "Her gün aynı saatte uyuyup uyanmak (hafta sonu dahil), vücudun doğal ritmini destekleyip genel enerji düzeyini artırabilir.",
        "Sleeping and waking at the same time every day (including weekends) supports your body's natural rhythm and can boost overall energy levels.",
    ),
    (
        "yasam",
        "Kendine ayırdığın küçük bir zaman dilimi (bir hobi, sessiz bir yürüyüş) bile genel yaşam memnuniyetini artırabilir — bunu 'lüks' değil ihtiyaç olarak görmekte fayda var.",
        "Even a small chunk of time set aside for yourself (a hobby, a quiet walk) can boost overall life satisfaction — it helps to see it as a need, not a 'luxury'.",
    ),
]


def get_daily_tip(language: str = "tr") -> tuple[str, str, str]:
    """Havuzdan RASTGELE bir (kategori_etiketi, ipucu_metni, ikon) üçlüsü
    döner — her çağrıda (her sayfa yüklemesinde) farklı bir ipucu
    görülebilsin diye kasıtlı olarak tarihe/kullanıcıya kilitli DEĞİL. DB'ye
    ya da LLM çağrısına ihtiyaç yok. `language`: kullanıcının
    UserProfile.preferred_language'ı ("tr"/"en") - hangi metin/etiketin
    döneceğini seçer, kaynak havuzu (DAILY_TIPS) etkilenmez."""
    key, tr_text, en_text = random.choice(DAILY_TIPS)
    text = en_text if language == "en" else tr_text
    label = CATEGORY_LABELS["en" if language == "en" else "tr"][key]
    return label, text, CATEGORY_ICONS.get(key, "💡")
