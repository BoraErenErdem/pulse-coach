# Makro ve Kalori Hesaplama Mantığı

Günlük kalori ihtiyacını kabaca tahmin etmek için önce Bazal Metabolizma Hızı
(BMR — vücudun dinlenme halindeyken harcadığı enerji) hesaplanır. Yaygın kullanılan
Mifflin-St Jeor formülü:

- Erkekler için: BMR = (10 × kilo[kg]) + (6.25 × boy[cm]) − (5 × yaş) + 5
- Kadınlar için: BMR = (10 × kilo[kg]) + (6.25 × boy[cm]) − (5 × yaş) − 161

BMR değeri, aktivite seviyesine göre bir çarpanla çarpılarak Toplam Günlük Enerji
Harcaması (TDEE) elde edilir:

- Hareketsiz (masa başı iş, egzersiz yok): BMR × 1.2
- Hafif aktif (haftada 1-3 gün hafif egzersiz): BMR × 1.375
- Orta aktif (haftada 3-5 gün orta egzersiz): BMR × 1.55
- Çok aktif (haftada 6-7 gün yoğun egzersiz): BMR × 1.725

Kilo verme hedefi için TDEE'nin altında bir kalori alımı (genelde %10-20 açık),
kilo alma/kas yapma hedefi için TDEE'nin üstünde bir alım (genelde %10-15 fazla)
önerilir. Çok büyük açıklar/fazlalar (örn. %30+) kas kaybına veya sağlıksız yağ
alımına yol açabileceğinden önerilmez.

Kabaca bir makro dağılımı örneği (kişiye ve hedefe göre değişir):
- Protein: vücut ağırlığının kilogramı başına 1.6-2.2 gram (özellikle kas yapma
  veya kilo verirken kas kütlesini korumak için önemlidir)
- Yağ: toplam kalorinin %20-35'i (hormon üretimi ve yağda çözünen vitaminler için)
- Karbonhidrat: kalan kalori (enerji ihtiyacı ve aktivite seviyesine göre ayarlanır)

Bu hesaplamalar genel birer tahmindir, kişinin metabolik durumuna göre gerçek
ihtiyaç farklılık gösterebilir; bu nedenle kesin/tıbbi bir diyet planı yerine
başlangıç noktası olarak kullanılmalıdır.
