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

export function useWorkoutIdentityColors(): Record<WorkoutIdentityKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
