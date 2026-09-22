import { useTheme } from "@/lib/theme-context";

// İlerleme sekmesinin "renk kimlikleri" (2026-09-19, kullanıcı isteği): her
// metriğin sayfa boyunca (kutu, grafik, sekme, rozet) AYNI rengi var. Renk
// TONU (hue) iki temada da aynı, sadece koyuluk/açıklık temaya göre ayarlı:
// koyu zeminde parlak, krem/beyaz zeminde daha derin - böylece kullanıcı
// "kilo = turuncu, antrenman = kırmızı" ilişkisini hangi temada olursa olsun
// aynı şekilde okur.
//
// Kilo TURUNCU (markanın vurgu rengi = sayfanın ana metriği), antrenman
// KIRMIZI (ilk sürüm pembe-mercan yönündeydi, kullanıcı "pembe gibi duruyor"
// dedi -> gerçek kırmızı). Seri 🔥 emojisinin alev rengi (sarımsı turuncudan
// kırmızı-turuncuya), yağ oranı sarı, kayıt sayısı koyu mavi, bel yeşil, ruh
// hali camgöbeği. Bel: açık pembe (kullanıcı isteği, önce yeşildi).
export type IdentityKey = "weight" | "workout" | "waist" | "fat" | "mood" | "entries" | "streak";

const DARK: Record<IdentityKey, string> = {
  weight: "#FF8A3D",
  workout: "#FF453A",
  waist: "#FFA3C8",
  fat: "#FFD84D",
  mood: "#4DD6E6",
  entries: "#3F82DA",
  streak: "#FF9F0A",
};

const LIGHT: Record<IdentityKey, string> = {
  weight: "#E8630A",
  workout: "#D9251C",
  waist: "#D6588F",
  fat: "#C99700",
  mood: "#0E8FA3",
  entries: "#1F5FBF",
  streak: "#E58600",
};

/** Koyu mod istatistik kutusu gradyanları (beyaz metin kontrastı gözetilerek
 * kimlik renginin koyu tonları). Sadece 2x2 ızgaradaki 4 kimlik için. */
export const TILE_GRADIENT_DARK: Record<"weight" | "workout" | "entries" | "streak", [string, string]> = {
  weight: ["#D26F26", "#8C441F"],
  workout: ["#D93A2B", "#8A1A12"],
  // Kullanıcı isteği (2026-09-22, ikinci oturum, "Bu Hafta Kayıt" tile'ı
  // için önerilen deneme - beğenilmezse geri alınabilir): koyu durak
  // ÖNCEDEN (#12305E) diğer 3 kimliğin (weight/workout/streak) koyu
  // duraklarından BELİRGİN daha karanlık/doygundu (parlaklık ~40 vs ~55-76),
  // sayfadaki TEK "inky" mavi gibi duruyordu. Aralığı diğerleriyle aynı
  // seviyeye getirmek için koyu durak biraz aydınlatıldı - hue DEĞİŞMEDİ,
  // hâlâ net bir mavi.
  entries: ["#2A5FA8", "#1E3F73"],
  // 🔥 gibi: altta sarımsı turuncu, üstte kırmızı-turuncu.
  streak: ["#EE9A10", "#D23A0B"],
};

/** 🔥 alev rampası (sarıdan kırmızı-turuncuya) - Seri noktaları için. Koyu
 * zeminde parlak, açık zeminde daha derin. */
export const FLAME_RAMP_DARK = ["#FFE27A", "#FFC93C", "#FF9F0A", "#FF7A1A", "#FF4E1F"];
export const FLAME_RAMP_LIGHT = ["#F5B301", "#F59A0B", "#EE7A0A", "#E8590C", "#D9381E"];

/** Hedef rengi = YEŞİL ("başarı") - hedef çizgisi, "Hedefe X" rozeti, hedef
 * belirle düğmesi ve hedefe ULAŞILINCA kartın tamamlanma hâli. Bel artık pembe
 * olduğu için yeşil hiçbir metrik kimliğiyle çakışmıyor. Aynı ton, iki temada
 * farklı koyuluk (koyu: parlak, açık: derin). */
export const GOAL_GREEN_DARK = "#5EDC8B";
export const GOAL_GREEN_LIGHT = "#2E9E5B";
/** Tamamlanmış hedef kartı gradyanı (koyu mod) - beyaz metin kontrastı için koyu yeşil. */
export const GOAL_DONE_GRADIENT_DARK: [string, string] = ["#2F8F5B", "#155A33"];

export function useGoalGreen(): string {
  const { theme } = useTheme();
  return theme === "dark" ? GOAL_GREEN_DARK : GOAL_GREEN_LIGHT;
}

export function useIdentityColors(): Record<IdentityKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
