import { useTheme } from "@/lib/theme-context";

// Profil sekmesinin kendi renk kimliği (2026-09-25 redesign) - diğer sekme
// kimlikleriyle (workout-identity.ts / nutrition-identity.ts) AYNI yöntem:
// sayfaya özel, tema-duyarlı, TEK paylaşımlı kaynak.
//
// Kimlik AMETİST (kullanıcı onayı): veri gösteren sıcak sekmelerin (Antrenman
// kırmızı → İlerleme turuncu → Beslenme zeytin) aksine "sen ve ayarların"
// sekmesi - bilerek soğuk ve sakin. CIEDE2000 ile ölçüldü: koyu en yakın
// kimlik bel pembesi 22.3, kayıt mavisi 23; açık kayıt mavisi 18.6 (lavanta/
// indigo kayıt mavisine 13.3/7.7 ile çok yakın kaldığı için elendi).
// Not: Beslenme'deki "yağ" besin rengi de mor (#B98CFF) - o renk sadece
// Beslenme sekmesinde görünüyor, Profil'de besin rengi gösterilmiyor.
//
// Kimlik ÜÇ rolde (nutrition-identity.ts'teki gibi):
// - `text`: küçük metin/ikon - koyu panelde 4.71:1 (#B98CFF 3.96:1 kalıyordu),
// - `graphic`: halka/çubuk/nokta/dolgu - parlak ametist,
// - `fill` + `onFill`: düğme/seçili çip (koyu 6.94:1, açık beyaz metin 6.3:1).
const ACTIVE = {
  dark: { text: "#C4A0FF", graphic: "#B98CFF", fill: "#B98CFF", onFill: "#1E1233" },
  light: { text: "#7A3FC4", graphic: "#7A3FC4", fill: "#7A3FC4", onFill: "#FFFFFF" },
};

export interface ProfileAccent {
  text: string;
  graphic: string;
  fill: string;
  onFill: string;
}

export function useProfileAccent(): ProfileAccent {
  const { theme } = useTheme();
  return theme === "dark" ? ACTIVE.dark : ACTIVE.light;
}

/** Profil ana ekranındaki 3 parlak kutu - Antrenman'ın 4 kırmızı tonu gibi
 * TEK aile (ametist) içinde farklılaşan tonlar. Koyu gradyanlarda beyaz metin
 * üst durakta 5.0-6.1:1; açık temada ProgressTile'daki pastel kalıp. */
export type ProfileTileKey = "streak" | "workouts" | "mood";

export const PROFILE_TILE_GRADIENT_DARK: Record<ProfileTileKey, [string, string]> = {
  streak: ["#9A4FB8", "#512263"],
  workouts: ["#7446C9", "#3B2275"],
  mood: ["#5B57C9", "#2E2C78"],
};

const TILE_SOLID_LIGHT: Record<ProfileTileKey, string> = {
  streak: "#9A3FB8",
  workouts: "#7A3FC4",
  mood: "#4F4FC0",
};

const TILE_SOLID_DARK: Record<ProfileTileKey, string> = {
  streak: "#E08CFF",
  workouts: "#B98CFF",
  mood: "#9C9CFF",
};

export function useProfileTileColors(): Record<ProfileTileKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? TILE_SOLID_DARK : TILE_SOLID_LIGHT;
}

/** Kimlik kartı (karşılama) - kahraman yüzey; beyaz metin 6.8:1. */
export const PROFILE_HERO_GRADIENT_DARK: [string, string] = ["#6A45B0", "#35205E"];

/** Hedef özeti kartı - SAKİN/soldurulmuş ametist (kart hiyerarşisi: kutular
 * parlak > hedef sakin > koç koyu). Koç kartından ΔE00 11.6 (ref. Antrenman
 * 11.8) ama kroma 24.6 < 57.9 - koç kartı daha canlı kalır; nötr panelden 16.2. */
export const PROFILE_GOALS_GRADIENT_DARK: [string, string] = ["#5A4A70", "#352B44"];

/** Koç kartı ("Koçundan son not") - KOYU ametist; beyaz metin 8.3:1, açık
 * temada krem üstü %40 ametist dolguda koyu metin 11.2:1. */
export const PROFILE_INSIGHT_TONE = {
  gradient: ["#5E3A96", "#2A1848", "#40285F"],
  lightFill: "rgba(185,140,255,0.40)",
  glow: "#8A5CD6",
};

// ---- Ruh Hali alt sayfası: ruh hali kimliği camgöbeği (progress-identity.ts::mood)

/** "Bugün" kahraman kartı (parlak) - beyaz metin 5.0:1. */
export const MOOD_HERO_GRADIENT_DARK: [string, string] = ["#1A7A88", "#0B4650"];

/** Koç kartı ("Ruh Hali Gözlemi") - KOYU camgöbeği; beyaz metin 9.0:1,
 * kahraman karttan ΔE00 14.4; açık temada koyu metin 13.2:1. */
export const MOOD_INSIGHT_TONE = {
  gradient: ["#15505A", "#0A2A30", "#103D45"],
  lightFill: "rgba(77,214,230,0.30)",
  glow: "#1E9FB0",
};

/** Camgöbeği küçük metin rolü: açık temada #0E8FA3 kremde 3.56:1 kalıyordu. */
export function useMoodAccent(): { text: string; graphic: string } {
  const { theme } = useTheme();
  return theme === "dark" ? { text: "#4DD6E6", graphic: "#4DD6E6" } : { text: "#0A7383", graphic: "#0E8FA3" };
}
