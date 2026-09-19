import { useTheme } from "@/lib/theme-context";

// İlerleme sekmesinin "renk kimlikleri" (2026-09-19, kullanıcı isteği): her
// metriğin sayfa boyunca (kutu, grafik, sekme, rozet) AYNI rengi var. Renk
// TONU (hue) iki temada da aynı, sadece koyuluk/açıklık temaya göre ayarlı:
// koyu zeminde parlak, krem/beyaz zeminde daha derin - böylece kullanıcı
// "kilo = turuncu, antrenman = kırmızı" ilişkisini hangi temada olursa olsun
// aynı şekilde okur.
//
// Kilo TURUNCU (markanın vurgu rengi = sayfanın ana metriği), antrenman
// KIRMIZI (bilinçli: kırmızı hata/silme renginden ayrışsın diye pembe-mercan
// yönünde, bkz. `error` #C42B2B/#E2584D). Diğerleri renk çemberinde birbirinden
// uzak tonlar: bel yeşil, yağ oranı mor, ruh hali camgöbeği, kayıt sayısı mavi,
// seri altın.
export type IdentityKey = "weight" | "workout" | "waist" | "fat" | "mood" | "entries" | "streak";

const DARK: Record<IdentityKey, string> = {
  weight: "#FF8A3D",
  workout: "#FF5468",
  waist: "#5EDC8B",
  fat: "#B79CFF",
  mood: "#4DD6E6",
  entries: "#5AB0FF",
  streak: "#FFC93C",
};

const LIGHT: Record<IdentityKey, string> = {
  weight: "#E8630A",
  workout: "#D42A45",
  waist: "#2E9E5B",
  fat: "#6D4AD8",
  mood: "#0E8FA3",
  entries: "#2F80D9",
  streak: "#C08A00",
};

/** Koyu mod istatistik kutusu gradyanları (beyaz metin kontrastı gözetilerek
 * kimlik renginin koyu tonları). Sadece 2x2 ızgaradaki 4 kimlik için. */
export const TILE_GRADIENT_DARK: Record<"weight" | "workout" | "entries" | "streak", [string, string]> = {
  weight: ["#D26F26", "#8C441F"],
  workout: ["#CB3B52", "#7A1C2E"],
  entries: ["#3B86D6", "#1B4478"],
  streak: ["#BE8C14", "#6B4A08"],
};

export function useIdentityColors(): Record<IdentityKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
