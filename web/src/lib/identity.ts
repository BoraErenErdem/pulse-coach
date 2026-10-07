// Renk kimlikleri - mobil uygulamanın onaylı tasarım dilinden (2026-10-07 web uyarlaması).
// Tek kaynak mobilde: mobile/components/{progress,workout,nutrition,profile}-identity.ts ve
// surface-tone.tsx. Renkler oradan BİREBİR; biri değişirse burası da değişmeli.
//
// Kullanım: StatTile `identity` prop'u (cam kutu: koyuda kimlik gradyanı + parıltı, açıkta
// kimlik tonlu beyaz) ve sayfa tonu (bkz. globals.css [data-tone]).

export interface TileIdentity {
  /** Koyu mod kutu gradyanı (sol-alttan sağ-üste), beyaz metin kontrastı gözetilmiş. */
  dark: [string, string];
  /** Koyu modda ikon/vurgu rengi (parlak ton). */
  darkSolid: string;
  /** Açık modda ikon, gölge ve hafif dolgu rengi (derin ton). */
  lightSolid: string;
}

export const TILE_IDENTITIES = {
  // İlerleme (progress-identity.ts)
  weight: { dark: ["#D26F26", "#8C441F"], darkSolid: "#FF8A3D", lightSolid: "#E8630A" },
  workout: { dark: ["#D93A2B", "#8A1A12"], darkSolid: "#FF453A", lightSolid: "#D9251C" },
  entries: { dark: ["#2A5FA8", "#1E3F73"], darkSolid: "#3F82DA", lightSolid: "#1F5FBF" },
  streak: { dark: ["#EE9A10", "#D23A0B"], darkSolid: "#FF9F0A", lightSolid: "#E58600" },
  // "Hedeflerin" kartı: soldurulmuş bakır (DARK_GOALS_GRADIENT); tamamlanınca hedef yeşili.
  goals: { dark: ["#7E5238", "#4A2F1F"], darkSolid: "#FF8A3D", lightSolid: "#E8630A" },
  goalsDone: { dark: ["#2F8F5B", "#155A33"], darkSolid: "#5EDC8B", lightSolid: "#2E9E5B" },
  // Antrenman (workout-identity.ts)
  sessions: { dark: ["#D93A2B", "#8A1A12"], darkSolid: "#FF453A", lightSolid: "#D9251C" },
  sets: { dark: ["#E85A38", "#8A2E14"], darkSolid: "#FF7A54", lightSolid: "#C24A24" },
  volume: { dark: ["#C4283F", "#6E0F22"], darkSolid: "#E8344A", lightSolid: "#A8123A" },
  calories: { dark: ["#E88A2A", "#8A4B0E"], darkSolid: "#FFA23D", lightSolid: "#B85F14" },
  // Beslenme (nutrition-identity.ts): kalori zeytin (kahraman kart gradyanı), besinler kendi
  // renginde. Mobilde besinler için kutu yok (kahraman kartın içinde); protein/lif/sodyum
  // gradyanları besin renginin koyu tonlarından türetildi.
  kalori: { dark: ["#76871A", "#3E4A0A"], darkSolid: "#CCD638", lightSolid: "#8C990F" },
  protein: { dark: ["#C2513A", "#6E2618"], darkSolid: "#FF7A5C", lightSolid: "#C0392B" },
  lif: { dark: ["#1E8A90", "#0E4A4E"], darkSolid: "#3FD0D8", lightSolid: "#0A7780" },
  sodyum: { dark: ["#56647E", "#2E3647"], darkSolid: "#AEB9D0", lightSolid: "#56647E" },
  // Beslenme kahraman kartı: NUTRITION_HERO_GRADIENT_DARK
  nutritionHero: { dark: ["#76871A", "#3E4A0A"], darkSolid: "#CCD638", lightSolid: "#8C990F" },
  // Profil (profile-identity.ts)
  profileStreak: { dark: ["#9A4FB8", "#512263"], darkSolid: "#E08CFF", lightSolid: "#9A3FB8" },
  profileWorkouts: { dark: ["#7446C9", "#3B2275"], darkSolid: "#B98CFF", lightSolid: "#7A3FC4" },
  profileMood: { dark: ["#5B57C9", "#2E2C78"], darkSolid: "#9C9CFF", lightSolid: "#4F4FC0" },
  // Profil kimlik (kahraman) kartı: PROFILE_HERO_GRADIENT_DARK
  profileHero: { dark: ["#6A45B0", "#35205E"], darkSolid: "#C4A0FF", lightSolid: "#7A3FC4" },
  // Ruh hali (progress-identity.ts::mood)
  mood: { dark: ["#1A7A88", "#0B4650"], darkSolid: "#4DD6E6", lightSolid: "#0E8FA3" },
} satisfies Record<string, TileIdentity>;

export type TileIdentityKey = keyof typeof TILE_IDENTITIES;

/** Kutunun CSS değişkenleri (globals.css .pc-tile bunları kullanır). */
export function tileStyle(key: TileIdentityKey): React.CSSProperties {
  const id = TILE_IDENTITIES[key];
  return {
    "--tile-a": id.dark[0],
    "--tile-b": id.dark[1],
    "--tile-solid-dark": id.darkSolid,
    "--tile-solid-light": id.lightSolid,
  } as React.CSSProperties;
}

/** Sayfa tonu (mobil surface-tone.tsx): rota -> ton anahtarı. */
export type SurfaceTone = "default" | "progress" | "workout" | "nutrition" | "profile" | "mood";

/** Mobildeki SurfaceToneProvider eşlemesiyle aynı (Bildirimler İlerleme tonunda, Hedefler Profil'de). */
export function toneForPath(pathname: string): SurfaceTone {
  if (pathname.startsWith("/progress") || pathname.startsWith("/checkins")) return "progress";
  if (pathname.startsWith("/workouts")) return "workout";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/profile") || pathname.startsWith("/goals")) return "profile";
  if (pathname.startsWith("/mood")) return "mood";
  return "default";
}
