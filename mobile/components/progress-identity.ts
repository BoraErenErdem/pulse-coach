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
// hali camgöbeği.
export type IdentityKey = "weight" | "workout" | "waist" | "fat" | "mood" | "entries" | "streak";

const DARK: Record<IdentityKey, string> = {
  weight: "#FF8A3D",
  workout: "#FF453A",
  waist: "#5EDC8B",
  fat: "#FFD84D",
  mood: "#4DD6E6",
  entries: "#3F82DA",
  streak: "#FF9F0A",
};

const LIGHT: Record<IdentityKey, string> = {
  weight: "#E8630A",
  workout: "#D9251C",
  waist: "#2E9E5B",
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
  entries: ["#2A5FA8", "#12305E"],
  // 🔥 gibi: altta sarımsı turuncu, üstte kırmızı-turuncu.
  streak: ["#EE9A10", "#D23A0B"],
};

export function useIdentityColors(): Record<IdentityKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
