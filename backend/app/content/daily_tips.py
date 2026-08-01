"""Günlük mikro-ipucu içerik havuzu.

Her ipucu, backend/knowledge_base/ altındaki (WHO, ISSN, NSCA, Sleep
Foundation, CDC, USDA gibi kaynaklardan kendi cümleleriyle sentezlenmiş)
bilgi tabanı dosyalarından türetilmiş, kısa ve tek başına anlaşılır hale
getirilmiş özetlerdir — verbatim kopya değildir (bkz. proje belleğindeki
"Copyright-Safe Knowledge Base" kararı, aynı ilke burada da uygulanıyor).
"""

from datetime import date as date_type
from datetime import datetime, timezone

DAILY_TIPS: list[str] = [
    "Günlük su ihtiyacın iklime, aktivite düzeyine ve genel sağlığına göre değişir; kadınlarda ortalama 2-2.7 litre, erkeklerde 2.5-3.7 litre civarı sıkça referans alınan bir aralıktır (yiyeceklerden gelen su dahil). (Genel beslenme bilimi)",
    "Hafif susuzluk bile yorgunluk ve konsantrasyon güçlüğüne yol açabilir — idrar renginin açık sarı olması genelde yeterli hidrasyonun bir işaretidir. (Genel beslenme bilimi)",
    "Düzenli egzersiz yapan biri için günlük protein ihtiyacı, hareketsiz bir bireye göre belirgin şekilde daha yüksektir — genel aralık kilogram başına 1.4-2.0 gramdır. (ISSN, 2017)",
    "Kas protein sentezini desteklemek için tek öğünde yaklaşık 20-40 gram kaliteli protein almak yeterli kabul edilir; bunu gün içindeki öğünlere yaymak faydalı olabilir. (ISSN, 2017)",
    "Protein ihtiyacını sadece etten değil, baklagiller, yumurta, süt ürünleri ve kuruyemiş gibi çeşitli kaynaklardan karşılamak mümkündür. (ISSN, 2017)",
    "Kompleks karbonhidratlar (tam tahıl, sebze, baklagil) rafine şekere göre kan şekerini daha yavaş yükseltir ve daha uzun tokluk sağlar. (USDA temelli)",
    "Yağ sadece enerji deposu değil, A, D, E, K vitaminlerinin emilimi için de gereklidir — çok düşük yağlı beslenmek bu vitaminlerin emilimini zorlaştırabilir. (USDA temelli)",
    "Kilo verme hedefi kalori açığı, kilo koruma enerji dengesi, kas/kilo alma ise yeterli proteinle desteklenen küçük bir kalori fazlası gerektirir. (Genel beslenme bilimi)",
    "Kademeli aşırı yüklenme (progressive overload) ilkesine göre vücut aynı yüke alıştıkça gelişim durur — ilerlemeyi sürdürmek için ağırlığı, tekrarı ya da hacmi zamanla artırmak gerekir. (NSCA)",
    "Kas gelişimi için tek yol 'daha ağır kaldırmak' değildir — geniş bir tekrar aralığında (5-30 tekrar) sete yeterli çabayla gitmek de benzer sonuçlar verebilir. (NSCA)",
    "Aynı kas grubuna yönelik yüksek yoğunluklu antrenmanlar arasında en az 48 saat dinlenmek, toparlanma ve sakatlanma riski açısından genel bir öneridir. (NSCA)",
    "Antrenman öncesi 5-10 dakikalık hafif/dinamik bir ısınma, kalp atışını ve kas sıcaklığını kademeli artırarak sakatlanma riskini azaltır. (CDC temelli)",
    "Uzun süreli statik esneme antrenman ÖNCESİNDE değil, kaslar hâlâ ısınmışken antrenman SONRASINDA (soğuma bölümünde) yapılırsa daha faydalıdır. (CDC temelli)",
    "Yetişkinler için haftada 150-300 dakika orta yoğunlukta ya da 75-150 dakika yüksek yoğunlukta aerobik aktivite öneriliyor — bu ikisinin bir kombinasyonu da işe yarar. (WHO, 2020)",
    "Aerobik aktivitenin yanında haftada en az 2 gün, ana kas gruplarını çalıştıran kuvvet egzersizi yapmak ek sağlık faydası sağlıyor. (WHO, 2020)",
    "Hiç hareket etmemekten iyidir: önerilen miktarları tam karşılamasan bile her fiziksel aktivite bir katkı sağlar — küçük başlayıp zamanla artırabilirsin. (WHO, 2020)",
    "Uzun süre oturmak (masa başı iş, ekran süresi) kalp-damar ve metabolik sağlık açısından risk taşır — saatte birkaç dakika kalkıp yürümek bile fark yaratabilir. (WHO, 2020)",
    "Yetişkinler için genel uyku önerisi gecede 7-9 saattir; yoğun antrenman yapanlarda bu ihtiyaç 9-10 saate kadar çıkabilir. (Sleep Foundation)",
    "Uyku kısaldığında kas gücü, reaksiyon süresi ve odaklanma olumsuz etkilenir — antrenman performansı düşüyorsa önce uyku düzenini gözden geçirmek iyi bir başlangıç noktasıdır. (Sleep Foundation)",
    "Derin uyku evresinde salgılanan büyüme hormonu kas onarımı ve toparlanma için kritik önemdedir — yetersiz uyku, kazandığın antrenman gelişimini yavaşlatabilir. (Sleep Foundation)",
]


def get_daily_tip(for_date: date_type | None = None) -> str:
    """Verilen güne (verilmezse bugüne) göre sabit/deterministik bir ipucu
    döner — aynı gün içinde herkes aynı ipucunu görür, gün değişince sıradaki
    ipucuna geçilir. DB'ye ya da LLM çağrısına ihtiyaç yok; takvim gününün
    ordinal'i havuzun uzunluğuna göre mod alınarak seçiliyor."""
    resolved = for_date or datetime.now(timezone.utc).date()
    return DAILY_TIPS[resolved.toordinal() % len(DAILY_TIPS)]
