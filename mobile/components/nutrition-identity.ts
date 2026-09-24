import { useTheme } from "@/lib/theme-context";

// Beslenme sekmesinin kendi renk kimliği (2026-09-24 redesign) -
// [[reference-pulsecoach-design-language]] §3'teki ilke (progress-identity.ts /
// workout-identity.ts'in ikizi): sayfaya özel, tema-duyarlı, TEK paylaşımlı
// kaynak.
//
// Sayfa kimliği ZEYTİN/AVOKADO (2026-09-24, kullanıcı seçimi - altın/bal/
// zeytin iki temada yan yana karşılaştırıldıktan sonra): taze besin çağrışımı,
// sekmeler arası en net ayrışan kimlik (Antrenman kırmızı, İlerleme turuncu).
//
// HEDEF YEŞİLİYLE AYRIM (tasarım dilinde yeşil = hedef, bkz. progress-identity
// GOAL_GREEN #5EDC8B/#2E9E5B, mavimsi nane ~142°): zeytin SARI tarafa (~64°)
// çekildi ve CIEDE2000 ile ölçüldü - ilk C tonu (#B5D33D) hedef yeşiline ΔE≈18
// idi, bu palet koyu 22.5 / açık grafik 20.3 / açık metin 24.7 (≥20 kategorik
// olarak farklı). Zeytin bandında tavan ~25 (daha sarısı hardala dönüyor), bu
// yüzden ayrım RENK DIŞI ipuçlarıyla da destekleniyor: hedef öğeleri her zaman
// ✓/hedef ikonu ya da kesikli çizgi taşır, kimlik öğeleri taşımaz.
//
// Kimlik ÜÇ rolde (açık temada tek ton metin için koyulaşınca yüzeylerde
// sönük kalıyor):
// - `text`: küçük metin/ikon (krem zeminde 5.35:1),
// - `graphic`: halka/çubuk/nokta (beyaz üstünde 3.14:1),
// - `fill` + `onFill`: düğme/seçili çip - parlak zeytin dolgu üstünde koyu
//   metin (8.9:1).
// Koyu temada üçü aynı parlak ton (kahve panelde 5.96:1).
export type NutrientKey = "kalori" | "protein" | "karbonhidrat" | "yağ" | "şeker" | "lif" | "sodyum";

const ACTIVE = {
  dark: { text: "#CCD638", heroGradient: ["#76871A", "#3E4A0A"] as [string, string], onFill: "#1E2600" },
  light: { text: "#646B00", graphic: "#8C990F", fill: "#D3DC52", onFill: "#2E3300" },
};

const DARK: Record<NutrientKey, string> = {
  kalori: ACTIVE.dark.text,
  protein: "#FF7A5C",
  karbonhidrat: "#5EA4FF",
  yağ: "#B98CFF",
  şeker: "#FF8CC6",
  lif: "#3FD0D8",
  sodyum: "#AEB9D0",
};

const LIGHT: Record<NutrientKey, string> = {
  // Kalori grafik rolünde (çubuk/nokta/halka) - metin için `useNutritionAccent`.
  kalori: ACTIVE.light.graphic,
  protein: "#C0392B",
  karbonhidrat: "#1F62C4",
  yağ: "#7A45C2",
  şeker: "#B8327A",
  lif: "#0A7780",
  sodyum: "#56647E",
};

/** Koyu mod "Bugün" kartı gradyanı (beyaz metin kontrastı için kimliğin koyu
 * tonları) - workout-identity.ts::WORKOUT_TILE_GRADIENT_DARK ile AYNI kalıp. */
export const NUTRITION_HERO_GRADIENT_DARK: [string, string] = ACTIVE.dark.heroGradient;

/** Kalori hedefi aşılınca halka/rozet rengi - yargılayıcı kırmızı DEĞİL (§2
 * nötr yargı), sıcak mercan: "dikkat" der, "hata" demez. */
const OVER_DARK = "#FF9466";
const OVER_LIGHT = "#B4461C";

/** Besin değeri renk eşlemesi - kart, hedef alanları, satırlar ve grafikler
 * HEP bu tek kaynaktan (2026-08-22'deki "aynı besin farklı yerde farklı renk"
 * bulgusunun kalıcı çözümü). Her besinin KENDİ rengi. */
export function useNutrientColors(): Record<NutrientKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}

/** Kimliğin METİN rolü (küçük yazı, ikon, ince kenarlık). */
export function useNutritionAccent(): string {
  const { theme } = useTheme();
  return theme === "dark" ? ACTIVE.dark.text : ACTIVE.light.text;
}

/** Kimliğin DOLGU rolü (düğme, seçili çip) + üstündeki metin rengi. */
export function useNutritionFill(): { fill: string; onFill: string } {
  const { theme } = useTheme();
  return theme === "dark"
    ? { fill: ACTIVE.dark.text, onFill: ACTIVE.dark.onFill }
    : { fill: ACTIVE.light.fill, onFill: ACTIVE.light.onFill };
}

/** "Bugünün Özeti" koç kartının zeytin tonu (ortak turuncu yerine). Koyu:
 * beyaz metin kontrastı ~5.6:1 (#5E6E18); açık: yarı saydam zeytin dolgu üstünde
 * koyu metin. */
export const NUTRITION_INSIGHT_TONE = {
  gradient: ["#5E6E18", "#2E3A08", "#434F12"],
  lightFill: "rgba(211,220,82,0.55)",
  glow: "#8C990F",
};

export function useCalorieOverColor(): string {
  const { theme } = useTheme();
  return theme === "dark" ? OVER_DARK : OVER_LIGHT;
}
