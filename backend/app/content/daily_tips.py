"""Günlük mikro-ipucu içerik havuzu.

Sağlık/beslenme/spor ipuçları backend/knowledge_base/ altındaki (WHO, ISSN,
NSCA, Sleep Foundation, CDC, USDA gibi kaynaklardan kendi cümleleriyle
sentezlenmiş) bilgi tabanı dosyalarından türetilmiş, kısa ve tek başına
anlaşılır hale getirilmiş özetlerdir — verbatim kopya değildir (bkz. proje
belleğindeki "Copyright-Safe Knowledge Base" kararı, aynı ilke burada da
uygulanıyor). Ruh hali / yaşam koçluğu / genel yaşam ipuçları, sayısal bir
iddia içermeyen (kaynak gerektirmeyen) genel iyi-yaşam pratikleridir.
"""

import random

# Her ipucu (kategori, metin) çifti. Kategori sadece UI'da küçük bir
# etiket/emoji göstermek için kullanılıyor, seçim mantığını etkilemiyor.
DAILY_TIPS: list[tuple[str, str]] = [
    # --- Beslenme ---
    ("Beslenme", "Düzenli egzersiz yapan biri için günlük protein ihtiyacı, hareketsiz bir bireye göre belirgin şekilde daha yüksektir — genel aralık kilogram başına 1.4-2.0 gramdır. (ISSN, 2017)"),
    ("Beslenme", "Kas protein sentezini desteklemek için tek öğünde yaklaşık 20-40 gram kaliteli protein almak yeterli kabul edilir; bunu gün içindeki öğünlere yaymak faydalı olabilir. (ISSN, 2017)"),
    ("Beslenme", "Protein ihtiyacını sadece etten değil, baklagiller, yumurta, süt ürünleri ve kuruyemiş gibi çeşitli kaynaklardan karşılamak mümkündür. (ISSN, 2017)"),
    ("Beslenme", "Kompleks karbonhidratlar (tam tahıl, sebze, baklagil) rafine şekere göre kan şekerini daha yavaş yükseltir ve daha uzun tokluk sağlar. (USDA temelli)"),
    ("Beslenme", "Yağ sadece enerji deposu değil, A, D, E, K vitaminlerinin emilimi için de gereklidir — çok düşük yağlı beslenmek bu vitaminlerin emilimini zorlaştırabilir. (USDA temelli)"),
    ("Beslenme", "Kilo verme hedefi kalori açığı, kilo koruma enerji dengesi, kas/kilo alma ise yeterli proteinle desteklenen küçük bir kalori fazlası gerektirir. (Genel beslenme bilimi)"),
    ("Beslenme", "Yemeğini yavaş yiyip her lokmanın tadını çıkarmak (bilinçli/mindful yeme), tokluk sinyallerini daha iyi fark etmene yardımcı olabilir."),
    ("Beslenme", "Haftalık öğün planlaması yapmak, günün yoğun anlarında sağlıksız/hazır seçeneklere yönelme ihtimalini azaltabilir."),
    # --- Spor ---
    ("Spor", "Kademeli aşırı yüklenme (progressive overload) ilkesine göre vücut aynı yüke alıştıkça gelişim durur — ilerlemeyi sürdürmek için ağırlığı, tekrarı ya da hacmi zamanla artırmak gerekir. (NSCA)"),
    ("Spor", "Kas gelişimi için tek yol 'daha ağır kaldırmak' değildir — geniş bir tekrar aralığında (5-30 tekrar) sete yeterli çabayla gitmek de benzer sonuçlar verebilir. (NSCA)"),
    ("Spor", "Aynı kas grubuna yönelik yüksek yoğunluklu antrenmanlar arasında en az 48 saat dinlenmek, toparlanma ve sakatlanma riski açısından genel bir öneridir. (NSCA)"),
    ("Spor", "Antrenman öncesi 5-10 dakikalık hafif/dinamik bir ısınma, kalp atışını ve kas sıcaklığını kademeli artırarak sakatlanma riskini azaltır. (CDC temelli)"),
    ("Spor", "Uzun süreli statik esneme antrenman ÖNCESİNDE değil, kaslar hâlâ ısınmışken antrenman SONRASINDA (soğuma bölümünde) yapılırsa daha faydalıdır. (CDC temelli)"),
    ("Spor", "Yetişkinler için haftada 150-300 dakika orta yoğunlukta ya da 75-150 dakika yüksek yoğunlukta aerobik aktivite öneriliyor — bu ikisinin bir kombinasyonu da işe yarar. (WHO, 2020)"),
    ("Spor", "Aerobik aktivitenin yanında haftada en az 2 gün, ana kas gruplarını çalıştıran kuvvet egzersizi yapmak ek sağlık faydası sağlıyor. (WHO, 2020)"),
    ("Spor", "Hiç hareket etmemekten iyidir: önerilen miktarları tam karşılamasan bile her fiziksel aktivite bir katkı sağlar — küçük başlayıp zamanla artırabilirsin. (WHO, 2020)"),
    # --- Sağlık ---
    ("Sağlık", "Günlük su ihtiyacın iklime, aktivite düzeyine ve genel sağlığına göre değişir; kadınlarda ortalama 2-2.7 litre, erkeklerde 2.5-3.7 litre civarı sıkça referans alınan bir aralıktır (yiyeceklerden gelen su dahil). (Genel beslenme bilimi)"),
    ("Sağlık", "Hafif susuzluk bile yorgunluk ve konsantrasyon güçlüğüne yol açabilir — idrar renginin açık sarı olması genelde yeterli hidrasyonun bir işaretidir. (Genel beslenme bilimi)"),
    ("Sağlık", "Uzun süre oturmak (masa başı iş, ekran süresi) kalp-damar ve metabolik sağlık açısından risk taşır — saatte birkaç dakika kalkıp yürümek bile fark yaratabilir. (WHO, 2020)"),
    ("Sağlık", "Yetişkinler için genel uyku önerisi gecede 7-9 saattir; yoğun antrenman yapanlarda bu ihtiyaç 9-10 saate kadar çıkabilir. (Sleep Foundation)"),
    ("Sağlık", "Uyku kısaldığında kas gücü, reaksiyon süresi ve odaklanma olumsuz etkilenir — antrenman performansı düşüyorsa önce uyku düzenini gözden geçirmek iyi bir başlangıç noktasıdır. (Sleep Foundation)"),
    ("Sağlık", "Derin uyku evresinde salgılanan büyüme hormonu kas onarımı ve toparlanma için kritik önemdedir — yetersiz uyku, kazandığın antrenman gelişimini yavaşlatabilir. (Sleep Foundation)"),
    ("Sağlık", "Uzun süre ekrana bakarken göz yorgunluğunu azaltmak için 20-20-20 kuralı denenebilir: her 20 dakikada bir, 20 saniye boyunca ~6 metre uzaktaki bir noktaya bakmak."),
    ("Sağlık", "Düzenli sağlık kontrolleri (tansiyon, rutin kan tahlilleri gibi), risk faktörlerini belirti vermeden önce fark etmenin en etkili yollarından biridir."),
    # --- Ruh Hali ---
    ("Ruh Hali", "Günde birkaç dakika şükran duyduğun 3 şeyi yazmak (şükran günlüğü), ruh halini olumlu yönde etkileyebilecek basit ve ücretsiz bir alışkanlıktır."),
    ("Ruh Hali", "Derin, yavaş nefes almak (ör. 4 saniye nefes al, 4 saniye tut, 4 saniye ver) sinir sistemini sakinleştirip anlık stresi azaltmaya yardımcı olabilir."),
    ("Ruh Hali", "Doğada (park, yeşil alan) geçirilen kısa zaman dilimleri bile ruh hali ve odaklanma üzerinde olumlu etkiler gösterebilir."),
    ("Ruh Hali", "Sosyal bağlantı, ruh sağlığını destekleyen en güçlü faktörlerden biridir — yalnız hissettiğinde bir yakınına mesaj atmak küçük ama etkili bir adım olabilir."),
    ("Ruh Hali", "Kendine karşı eleştirel değil şefkatli konuşmak, zorlandığın anlarda bir yakınına gösterdiğin anlayışı kendine de göstermekten geçebilir."),
    ("Ruh Hali", "Sosyal medyada/haberlerde geçirilen süreyi bilinçli olarak sınırlamak, özellikle yatmadan önce, kaygı düzeyini azaltabilir."),
    ("Ruh Hali", "Duygularını bastırmak yerine isimlendirmek ('şu an gergin hissediyorum' demek gibi) onları daha yönetilebilir hale getirebilir."),
    ("Ruh Hali", "Küçük, ulaşılabilir bir hedefi tamamlamak bile motivasyon hissini tetikleyebilir — büyük bir günü küçük adımlara bölmek bunalmışlık hissini azaltabilir."),
    # --- Yaşam Koçluğu ---
    ("Yaşam Koçluğu", "Net olmayan hedefler yerine SMART (Spesifik, Ölçülebilir, Ulaşılabilir, İlgili, Zamana bağlı) hedefler belirlemek ilerlemeyi takip etmeyi kolaylaştırır."),
    ("Yaşam Koçluğu", "Yeni bir alışkanlığı zaten var olan bir alışkanlığa eklemek ('alışkanlık istifleme' — ör. 'diş fırçaladıktan sonra 5 dakika esneme yaparım') yeni rutinleri kalıcı hale getirmede etkili bir yöntemdir."),
    ("Yaşam Koçluğu", "Büyük bir hedefe odaklanmak yerine sürece/günlük tutarlılığa odaklanmak, uzun vadede motivasyonu korumada genelde daha etkilidir."),
    ("Yaşam Koçluğu", "Küçük ilerlemeleri fark edip kutlamak (bir haftalık antrenman serisi, bir hedefe biraz daha yaklaşmak gibi) motivasyonu besleyen basit ama gözden kaçan bir adımdır."),
    ("Yaşam Koçluğu", "Zamanını bloklar halinde planlamak (time-blocking) — belirli işler için belirli saatler ayırmak — dağınık bir günü daha yönetilebilir hale getirebilir."),
    ("Yaşam Koçluğu", "'Hayır' demeyi öğrenmek, zamanını ve enerjini gerçekten önemli olan hedeflere ayırabilmenin bir parçasıdır."),
    ("Yaşam Koçluğu", "Günü net bir sabah rutiniyle başlatmak (su içmek, birkaç dakika hareket etmek, önceliklerini gözden geçirmek gibi) günün geri kalanına olumlu bir ivme kazandırabilir."),
    ("Yaşam Koçluğu", "İlerlemeni yazılı olarak takip etmek sadece motive etmekle kalmaz, nelerin senin için işe yaradığını görmeni de sağlar."),
    # --- Yaşam ---
    ("Yaşam", "Çalışma ve dinlenme arasında net bir sınır çizmek (ör. iş bittiğinde bilgisayarı kapatmak) uzun vadede tükenmişliği önlemeye yardımcı olabilir."),
    ("Yaşam", "Yatmadan önce ekran süresini azaltmak sadece uyku kalitesini değil, genel ruh halini de olumlu etkileyebilir."),
    ("Yaşam", "Düzenli, küçük molalar (ör. her saat başı birkaç dakika kalkıp gerinmek) uzun oturma periyotlarının olumsuz etkilerini azaltabilir."),
    ("Yaşam", "Fiziksel ortamını (masan, odan) düzenli tutmak, zihinsel netlik üzerinde şaşırtıcı derecede olumlu bir etkiye sahip olabilir."),
    ("Yaşam", "Her gün aynı saatte uyuyup uyanmak (hafta sonu dahil), vücudun doğal ritmini destekleyip genel enerji düzeyini artırabilir."),
    ("Yaşam", "Kendine ayırdığın küçük bir zaman dilimi (bir hobi, sessiz bir yürüyüş) bile genel yaşam memnuniyetini artırabilir — bunu 'lüks' değil ihtiyaç olarak görmekte fayda var."),
]

CATEGORY_ICONS: dict[str, str] = {
    "Beslenme": "🍎",
    "Spor": "🏋️",
    "Sağlık": "💚",
    "Ruh Hali": "🧘",
    "Yaşam Koçluğu": "🎯",
    "Yaşam": "🌿",
}


def get_daily_tip() -> tuple[str, str]:
    """Havuzdan RASTGELE bir (kategori, ipucu) çifti döner — her çağrıda
    (her sayfa yüklemesinde) farklı bir ipucu görülebilsin diye kasıtlı
    olarak tarihe/kullanıcıya kilitli DEĞİL. DB'ye ya da LLM çağrısına
    ihtiyaç yok."""
    return random.choice(DAILY_TIPS)
