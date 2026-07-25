"""rag_groundedness ve turkish_quality kategorilerindeki yanıtları Claude'un
elle okuyup 1-5 puanladığı sonuçları raw_results.json'a işler (manual_score +
manual_notes alanları eklenir).

Final tur (82 senaryo, batch-by-model koşum) — emoji toleranslı kriter:
ölçülü/tek-iki emoji artık düşürücü değil, sadece aşırı/spam kullanım
cezalandırılıyor. Bir önceki turun puanlarının yerini alır (yanıtlar
yeniden örneklendiği için içerik değişmiş olabilir, temperature=0.3).
"""

import json
from pathlib import Path

RESULTS_PATH = Path(__file__).resolve().parent / "results" / "raw_results.json"

# (scenario_id, model) -> (1-5 puan, kısa gerekçe)
MANUAL_SCORES = {
    ("rg01", "gemma4:e4b"): (5, "1.4-2.0 g/kg doğru, iyi hedge."),
    ("rg01", "qwen3:14b"): (5, "1.4-2.0 g/kg doğru + somut 70kg örneği, hedge de var."),
    ("rg02", "gemma4:e4b"): (4, "150-300/75-150 dk doğru; haftada 2+ gün kas güçlendirme eksik kaldı."),
    ("rg02", "qwen3:14b"): (5, "150 dk + 2 gün kas güçlendirme + 65+ denge egzersizi bonusuyla kaynakla tam uyumlu."),
    ("rg03", "gemma4:e4b"): (5, "Kadın 2.0-2.7L / erkek 2.5-3.7L kaynakla birebir, tool çağrıldı."),
    ("rg03", "qwen3:14b"): (2, "search_nutrition_knowledge yine çağrılmadı (round1'deki aynı desen tekrarlandı) — genel '2-3 litre' rakamı, cinsiyet ayrımı kayboldu."),
    ("rg04", "gemma4:e4b"): (4, "BMR/TDEE kavramı ve Mifflin-St Jeor ismi doğru ama formül rakamları verilmedi."),
    ("rg04", "qwen3:14b"): (3, "Bu turda tool HİÇ çağrılmadı, formül ismi geçti ama rakamlar/katsayılar verilmedi — round1'de aynı soruya tool çağırıp tam formülü vermişti, tutarsızlık."),
    ("rg05", "gemma4:e4b"): (5, "Ağırlık/tekrar/hacim/yoğunluk alternatifleri kaynakla uyumlu."),
    ("rg05", "qwen3:14b"): (5, "Ağırlık/tekrar/hacim/dinlenme + toparlanma/form vurgusu doğru ve öz."),
    ("rg06", "gemma4:e4b"): (5, "5-10 dakika + dinamik esneme kaynakla birebir uyumlu."),
    ("rg06", "qwen3:14b"): (4, "Bu turda '5-10 dakika' doğru (round1'deki '5-15' sapması bu turda yok) ama dinamik/statik ayrımından bahsetmedi."),
    ("rg07", "gemma4:e4b"): (4, "7-9 saat doğru ama yine search_nutrition_knowledge çağrıldı (uyku exercise KB'sinde) — tool seçimi tutarsız."),
    ("rg07", "qwen3:14b"): (4, "7-9 saat doğru, bu turda bir tool çağrıldı (round1'de hiç çağrılmamıştı) ama yine nutrition tool'u (yanlış kategori)."),
    ("rg08", "gemma4:e4b"): (4, "Halüsinasyon tuzağına düşmedi, kesin sayı vermedi, '30-60 dk' molayı kendi ekledi (kaynakta yok ama zararsız)."),
    ("rg08", "qwen3:14b"): (2, "GERÇEK HALÜSİNASYON: 'WHO, haftada 8 saatten fazla sedanter davranışın riskli olduğunu belirtir' — kaynakta böyle bir eşik YOK, kaynak net şekilde 'kesin eşik belirlenemedi' diyor, model bunu uydurdu."),
    ("rg09", "gemma4:e4b"): (5, "500 kcal riskini doğru vurguladı, plan vermek yerine uzmana yönlendirdi."),
    ("rg09", "qwen3:14b"): (5, "'MLD' kategorisini doğru tanımladı, 300-500 kcal açık ve haftada 0.5-1kg rakamlarıyla kaynakla tam uyumlu, çok isabetli."),
    ("rg10", "gemma4:e4b"): (4, "Karbonhidrat %45-65 doğru, protein/yağ için rakam vermedi (genel geçti)."),
    ("rg10", "qwen3:14b"): (4, "Karbonhidrat % ve protein g/kg doğru; yağ için kaynakta veri olmasına rağmen 'bilgi tabanında detaylı veri yok' dedi (küçük bir eksik/yanlış boşluk beyanı)."),
    ("rg11", "gemma4:e4b"): (5, "Kuvvet antrenmanı önceliği + aşırı kardiyo uyarısı + progressive overload bağlantısı doğru."),
    ("rg11", "qwen3:14b"): (5, "Kuvvet önceliği + kardiyo dengesi + aşırı kardiyo uyarısı doğru ve öz."),
    ("rg12", "gemma4:e4b"): (5, "Bel yuvarlanmasının yaygın hata olduğu, core sıkma, fizyoterapist önerisi — kaynakla tam uyumlu."),
    ("rg12", "qwen3:14b"): (4, "Genel doğru ama 'kas dengesizliğinden kaynaklanabilir' kaynakta olmayan, kendi eklediği bir sebep."),
    ("rg13", "gemma4:e4b"): (5, "Nötr omurga, kalça/bacak ile kaldırma — kaynakla tam uyumlu."),
    ("rg13", "qwen3:14b"): (5, "Aynı noktalar + diz takibi bonus, kaynakla uyumlu."),
    ("rg14", "gemma4:e4b"): (4, "Doktora yönlendirme doğru, 'çok bileşenli' dedi ama haftada 3+ gün gibi somut rakam vermedi."),
    ("rg14", "qwen3:14b"): (5, "150-300 dk + 2+ gün kas güçlendirme + tai chi gibi somut denge örnekleri — kaynakla tam uyumlu."),
    ("rg15", "gemma4:e4b"): (4, "5 grup içeriği doğru (sebze/meyve/protein/tahıl/süt) ama tabak modelinin yapısını somutlaştırmadı."),
    ("rg15", "qwen3:14b"): (2, "GERÇEK HALÜSİNASYON: 'sebze-meyve %50, tam tahıl %25, protein %25' gibi somut yüzdeler uydurdu — TÜBER kaynağında böyle bir yüzde bölünmesi YOK (bu ABD 'MyPlate' modeline benziyor, TÜBER'e değil), tool da çağrılmadı."),
    ("rg16", "gemma4:e4b"): (4, "Makul ama kaynaktaki spesifik örnekler yerine kendi örnekleri (mercimek köftesi) verildi."),
    ("rg16", "qwen3:14b"): (5, "Kaynaktaki örneklerle (tofu/tempeh sote, mercimek çorbası) neredeyse birebir örtüşüyor."),
    ("rg17", "gemma4:e4b"): (5, "Diyet türleri arasında anlamlı fark olmadığı, sürdürülebilirliğin belirleyici olduğu doğru aktarıldı."),
    ("rg17", "qwen3:14b"): (4, "Genel doğru ama 'kişinin metabolik tepkilerine' gibi kaynakta olmayan bir spekülasyon eklendi."),
    ("tq01", "gemma4:e4b"): (3, "6 cümle — 3-4 cümle kuralını belirgin aşıyor."),
    ("tq01", "qwen3:14b"): (4, "4 cümle, doğal, ölçülü."),
    ("tq02", "gemma4:e4b"): (5, "4 cümle, sıcak, doğal metafor ('maraton, sprint değil')."),
    ("tq02", "qwen3:14b"): (5, "2 cümle, sıcak ve doğal."),
    ("tq03", "gemma4:e4b"): (3, "8 cümle — çok uzun, ama en azından soruyu (150-300dk) gerçekten yanıtladı."),
    ("tq03", "qwen3:14b"): (2, "Kısa ama soruyu HİÇ yanıtlamadı, sadece profil bilgisi istedi — kullanıcının sıcak yorumunu ('motive ediyor') görmezden geldi, soğuk/transaksiyonel kaldı."),
    ("tq04", "gemma4:e4b"): (5, "4 cümle, doğal, sıcak."),
    ("tq04", "qwen3:14b"): (4, "4 cümle doğal ama gereksiz update_user_profile çağrısı (dil kalitesini etkilemiyor)."),
    ("tq05", "gemma4:e4b"): (5, "4 cümle, sıcak ve doğal."),
    ("tq05", "qwen3:14b"): (5, "3 cümle, doğal, 'Anlayabilirim' doğru kullanım (tq06'daki hatanın tersi)."),
    ("tq06", "gemma4:e4b"): (4, "4 cümle, empatik, ölçülü emoji."),
    ("tq06", "qwen3:14b"): (2, "'Anlamıyorum, bu kadar zor bir gün geçirdiğinizi...' — round1'deki AYNI anlam-tersine-dönme hatası bu turda da tekrarlandı, artık tekrarlanan/reprodüksiyonu yapılabilir bir kusur."),
    ("tq07", "gemma4:e4b"): (4, "4 cümle, doğal, kutlayıcı ton uygun."),
    ("tq07", "qwen3:14b"): (5, "4 cümle, net, doğal, ilgi çekici kapanış sorusu."),
    ("tq08", "gemma4:e4b"): (4, "5 cümle (biraz uzun) ama empatik ve doğal."),
    ("tq08", "qwen3:14b"): (5, "4 cümle, pratik çözüm (akşam antrenmanı) sunuyor, doğal."),
    ("tq09", "gemma4:e4b"): (5, "3 cümle, kullanıcının enerjisiyle uyumlu, ölçülü emoji."),
    ("tq09", "qwen3:14b"): (4, "3 cümle, doğal ama 2 farklı tool çağrılması (encouragement+log_progress) basit bir mesaj için biraz fazla işlem."),
    ("tq10", "gemma4:e4b"): (3, "5 cümle, içerik doğru ama 'hocam...ya' gibi samimi kayda hiç uymayan resmi bir ton kullanıldı."),
    ("tq10", "qwen3:14b"): (4, "2 cümle, öz, dikkat dağılması nüansı doğru bir ekleme, samimi kayda gemma'dan daha yakın."),
    ("tq11", "gemma4:e4b"): (4, "5 cümle (biraz uzun) ama sinirlenmeyi doğru şekilde (üzüntü değil) yansıtıyor."),
    ("tq11", "qwen3:14b"): (3, "3 cümle ama 'kendine kuvvet ver' doğal olmayan bir ifade (beklenen 'güç ver'/'kendine iyi davran')."),
    ("tq12", "gemma4:e4b"): (3, "6 cümle — basit bir 'nasılsın' mesajı için gereğinden uzun."),
    ("tq12", "qwen3:14b"): (5, "4 cümle, doğal, ölçülü sıcaklık."),
    ("tq13", "gemma4:e4b"): (3, "Kullanıcı açıkça 'kısaca söyle' dedi, gemma yine de tam paragraf yazdı — talebi tam karşılamadı."),
    ("tq13", "qwen3:14b"): (5, "Gerçekten kısa ve net — 'kısaca söyle' talebini doğru şekilde karşıladı."),
    ("tq14", "gemma4:e4b"): (4, "4 cümle, sıcak, 'hiç niyetim yok'a saygılı, zorlamıyor."),
    ("tq14", "qwen3:14b"): (3, "3 cümle ama 'Günlüklerinizde dinlenme günleri de önemlidir' tuhaf/belirsiz bir ifade ('günlükleriniz' referansı net değil)."),
    ("tq15", "gemma4:e4b"): (3, "8 cümle — çok uzun, içerik doğru olsa da 3-4 cümle kuralını ciddi şekilde aşıyor."),
    ("tq15", "qwen3:14b"): (5, "3 cümle, doğru ve öz, biraz daha resmi kayda uygun."),
    ("tq16", "gemma4:e4b"): (4, "5 cümle (sınırın biraz üstünde), coşkuyla uyumlu, ölçülü emoji."),
    ("tq16", "qwen3:14b"): (5, "4 cümle, coşkuyu doğru yansıtıyor, öz."),
}


def main() -> None:
    data = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    missing = []
    for record in data:
        if record["category"] not in ("rag_groundedness", "turkish_quality"):
            continue
        key = (record["scenario_id"], record["model"])
        if key not in MANUAL_SCORES:
            missing.append(key)
            continue
        score, note = MANUAL_SCORES[key]
        record["manual_score"] = score
        record["manual_notes"] = note

    if missing:
        raise SystemExit(f"Eksik manuel puan: {missing}")

    RESULTS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(MANUAL_SCORES)} manuel puan işlendi.")


if __name__ == "__main__":
    main()
