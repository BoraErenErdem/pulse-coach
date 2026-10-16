// App Store ekran görüntüsü metinleri (TR/EN) - template.html okur, render.mjs her
// slayt x dil için bir PNG üretir. Sıra mağazadaki sıradır; ilk üçü arama sonucunda
// görünür. Renkler uygulamadaki sekme kimlikleri (mobile/components/*-identity.ts,
// açık tema tonları; `dark` koyu temanın parlak tonları, `on` dolgu üstündeki işaret rengi).
// `<em>` içindeki kelime kimlik renginde yazılır.
//
// `callout`: telefonun kenarından taşan tek kart. Yalnız uygulamada gerçekten olan,
// ekran görüntüsündeki veriden bağımsız bilgiler yazılır (katalog sayıları, özellikler);
// sohbet slaytındaki satırlar ekran görüntüsündeki mesajla aynı olmalı. `check`: kartın
// başında onay işareti (kayıt/onay anlatan kartlar); yoksa başlık büyük bir sayı gibi yazılır.
window.SLIDES = [
  {
    id: "chat",
    color: "#DD5B2E",
    soft: "#FFDCCD",
    dark: { color: "#E0612F", ink: "#FF8F5E", soft: "#3B2219", on: "#FFFFFF" },
    brand: true,
    tr: {
      headline: "Yaz, koçun <em>kaydetsin.</em>",
      sub: "Ne yediğini, ne yaptığını anlat; öğüne ve antrenmana o çevirsin.",
      callout: { title: "Kayıtlarına eklendi", lines: ["Öğle yemeği · tavuk, bulgur", "Yürüyüş · 30 dk"] },
    },
    en: {
      headline: "Just type. Your coach <em>logs it.</em>",
      sub: "Tell it what you ate and did; it turns that into meals and workouts.",
      callout: { title: "Added to your logs", lines: ["Lunch · chicken, bulgur", "Walking · 30 min"] },
    },
    calloutAt: { side: "right", top: 0.6 },
    check: true,
  },
  {
    id: "photo",
    color: "#8C990F",
    ink: "#646B00",
    soft: "#EEF0C6",
    dark: { color: "#CCD638", ink: "#CCD638", soft: "#2B3109", on: "#1E2600" },
    tr: {
      eyebrow: "Fotoğrafla öğün",
      headline: "Tabağını çek, <em>kalorisini gör.</em>",
      sub: "Besinler ve gramlar tahmin edilir; düzenle, onayla, kaydet.",
      callout: { title: "Sen onaylamadan kaydedilmez" },
    },
    en: {
      eyebrow: "Meals from a photo",
      headline: "Snap your plate, <em>see the calories.</em>",
      sub: "Foods and grams are estimated; edit, confirm, save.",
      callout: { title: "Nothing is saved until you confirm" },
    },
    calloutAt: { side: "left", top: 0.84 },
    check: true,
  },
  {
    id: "nutrition",
    color: "#8C990F",
    ink: "#646B00",
    soft: "#EEF0C6",
    dark: { color: "#CCD638", ink: "#CCD638", soft: "#2B3109", on: "#1E2600" },
    tr: {
      eyebrow: "Beslenme",
      headline: "Öğünlerin, <em>gram gram.</em>",
      sub: "Kalori halkası, makrolar ve boyuna, hedefine göre kalori önerisi.",
      callout: { title: "7.900+ besin", lines: ["Türk mutfağı dahil"] },
    },
    en: {
      eyebrow: "Nutrition",
      headline: "Your meals, <em>gram by gram.</em>",
      sub: "Calorie ring, macros and a calorie target for your height and goal.",
      callout: { title: "7,900+ foods", lines: ["Turkish cuisine included"] },
    },
    calloutAt: { side: "right", top: 0.71 },
  },
  {
    id: "workouts",
    color: "#D9251C",
    soft: "#FBDCD6",
    dark: { color: "#FF453A", ink: "#FF6A5E", soft: "#3D1714", on: "#FFFFFF" },
    tr: {
      eyebrow: "Antrenman",
      headline: "Her set, <em>her rekor.</em>",
      sub: "Haftalık hedefin, en iyi setlerin ve gelişim grafiğin.",
      callout: { title: "890+ egzersiz", lines: ["ve kardiyo türü"] },
    },
    en: {
      eyebrow: "Workouts",
      headline: "Every set, <em>every record.</em>",
      sub: "Your weekly goal, best sets and a progress chart.",
      callout: { title: "890+ exercises", lines: ["and cardio types"] },
    },
    calloutAt: { side: "left", top: 0.7 },
  },
  {
    id: "progress",
    color: "#E8630A",
    soft: "#FFE3CC",
    dark: { color: "#FF8A3D", ink: "#FF8A3D", soft: "#3B2219", on: "#2A1405" },
    tr: {
      eyebrow: "İlerleme",
      headline: "Gelişimin, <em>tek bir sayıdan fazlası.</em>",
      sub: "Kilo, bel ve yağ oranı hedefleri; haftalık içgörü ve trend.",
      callout: { title: "Her pazar", lines: ["koçundan haftanın özeti"] },
    },
    en: {
      eyebrow: "Progress",
      headline: "Progress is more than <em>one number.</em>",
      sub: "Weight, waist and body fat goals; weekly insights and trends.",
      callout: { title: "Every Sunday", lines: ["your weekly review"] },
    },
    calloutAt: { side: "right", top: 0.61 },
  },
  {
    id: "profile",
    color: "#7A3FC4",
    soft: "#E9DDFA",
    dark: { color: "#B98CFF", ink: "#C4A0FF", soft: "#2A1F3D", on: "#1E1233" },
    tr: {
      eyebrow: "Motivasyon",
      headline: "Küçük adımlar <em>sayılır.</em>",
      sub: "Seri, rozetler, ruh hali takvimi ve tüm hedeflerin tek yerde.",
      callout: { title: "9 rozet", lines: ["seriden rekora"] },
    },
    en: {
      eyebrow: "Motivation",
      headline: "Small steps <em>count.</em>",
      sub: "Streaks, badges, a mood calendar and all your goals in one place.",
      callout: { title: "9 badges", lines: ["from streaks to records"] },
    },
    calloutAt: { side: "right", top: 0.57 },
  },
];
