import { useTheme } from "@/lib/theme-context";

// Antrenman sekmesinin kendi renk kimliği (2026-09-22 redesign) -
// [[reference-pulsecoach-design-language]] §3'teki ilkeyle AYNI yöntem
// (progress-identity.ts'in ikizi): bu sayfaya özel, tema-duyarlı, TEK
// paylaşımlı kaynak. İlerleme sayfası kimlik başına FARKLI hue kullanıyordu
// (kilo turuncu, antrenman kırmızı, ...) - Antrenman sekmesi BİLEREK TEK bir
// aile (kırmızı) etrafında 4 tonla farklılaşıyor: sayfanın "kimliği"
// İlerleme'nin çok renkliliğinden Antrenman'ın kırmızı-ağırlıklı kimliğiyle
// ayrışsın diye (kullanıcı isteği: "antrenman sekmesinin kimliğini
// kaybetmeden"). `sessions` mevcut progress-identity.ts::workout (#FF453A/
// #D9251C) ile AYNI ton - iki sayfada da "antrenman" aynı kırmızı okunsun.
export type WorkoutIdentityKey = "sessions" | "sets" | "volume" | "calories";

const DARK: Record<WorkoutIdentityKey, string> = {
  sessions: "#FF453A",
  sets: "#FF7A54",
  volume: "#E8344A",
  calories: "#FFA23D",
};

const LIGHT: Record<WorkoutIdentityKey, string> = {
  sessions: "#D9251C",
  sets: "#C24A24",
  volume: "#A8123A",
  calories: "#B85F14",
};

/** Koyu mod istatistik kutusu gradyanları - progress-identity.ts::TILE_GRADIENT_DARK ile AYNI kalıp. */
export const WORKOUT_TILE_GRADIENT_DARK: Record<WorkoutIdentityKey, [string, string]> = {
  sessions: ["#D93A2B", "#8A1A12"],
  sets: ["#E85A38", "#8A2E14"],
  volume: ["#C4283F", "#6E0F22"],
  calories: ["#E88A2A", "#8A4B0E"],
};

/** Koç kartları (ProgressInsight: "Bu Haftaki Antrenman Özetin", "Koçunun
 * Yorumu") - ortak turuncu (İlerleme'nin rengi) yerine sekmenin kimliğinde
 * (2026-09-24, kullanıcı isteği). Parlak kırmızı DEĞİL, koyu BORDO: üstündeki
 * 4 kırmızı kutu + kırmızı Haftalık Hedef kartıyla üst üste parlak kırmızı blok
 * yığılmasın, "bir istatistik daha" değil "koçun notu" okunsun. Koyu: beyaz
 * metin 9.6-16:1, Haftalık Hedef kırmızısından ΔE00 20.8; açık: krem üstünde
 * gül tonu, koyu metin 10.9:1. */
export const WORKOUT_INSIGHT_TONE = {
  gradient: ["#7A2A2A", "#3E1414", "#5A2020"],
  lightFill: "rgba(242,139,122,0.45)",
  glow: "#B8332A",
};

export function useWorkoutIdentityColors(): Record<WorkoutIdentityKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}

// "Antrenman Kaydet" formundaki "Antrenman Türü" chip'lerinin seçili rengi
// (2026-09-22, üçüncü oturum, kullanıcı isteği: "kuvvet kırmızı, kardiyo
// sarı, esneklik yeşil, karışık mor"). BİLİNÇLİ olarak workout-type-chart.tsx/
// workout-volume-chart.tsx'in kendi paletinden (kardiyo=kehribar, esneklik=
// teal) FARKLI - kullanıcı bu buton grubu için net/doygun renkler istedi,
// grafik paletiyle TAM eşleşmiyor. Kuvvet zaten `sessions` (yukarısı) ile
// AYNI kırmızı, karışık zaten grafik paletiyle AYNI mor - sadece kardiyo
// (sarı) ve esneklik (yeşil, `progress-identity.ts::GOAL_GREEN` ile AYNI
// vetted ton) YENİ.
export type WorkoutTypeChipKey = "kuvvet" | "kardiyo" | "esneklik" | "karışık";

const CHIP_DARK: Record<WorkoutTypeChipKey, string> = {
  kuvvet: DARK.sessions,
  kardiyo: "#FFD84D",
  esneklik: "#5EDC8B",
  karışık: "#B478E0",
};

const CHIP_LIGHT: Record<WorkoutTypeChipKey, string> = {
  kuvvet: LIGHT.sessions,
  kardiyo: "#C99700",
  esneklik: "#2E9E5B",
  karışık: "#7C3FA6",
};

export function useWorkoutTypeChipColors(): Record<WorkoutTypeChipKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? CHIP_DARK : CHIP_LIGHT;
}
