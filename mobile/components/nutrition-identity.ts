import { useTheme } from "@/lib/theme-context";

// Beslenme sekmesinin kendi renk kimliği (2026-09-24 redesign) -
// [[reference-pulsecoach-design-language]] §3'teki ilke (progress-identity.ts /
// workout-identity.ts'in ikizi): sayfaya özel, tema-duyarlı, TEK paylaşımlı
// kaynak.
//
// Sayfa kimliği BAL/ALTIN (enerji = kalori): uygulamanın sıcak tayfında her
// sekme kendi basamağında - Antrenman kırmızı, İlerleme/Sohbet turuncu,
// Beslenme bal sarısı. YEŞİL BİLEREK seçilmedi: tasarım dilinde yeşil "hedef"
// rengine ayrılmış (bel kimliği de bu yüzden yeşilden pembeye çekilmişti).
//
// Kimlik ÜÇ rolde (2. tur, 2026-09-24): sarı tonları açık krem zeminde küçük
// metin olarak okunsun diye koyulaştırılınca hardal/kahveye dönüyordu - bu
// yüzden açık temada TEK bir ton yerine:
// - `text`: küçük metin/ikon (krem zeminde ~AA, elle ölçüldü),
// - `graphic`: halka/çubuk/nokta (büyük grafik öğe, ~3:1),
// - `fill` + `onFill`: düğme/seçili çip gibi büyük yüzey - PARLAK bal dolgu
//   üstünde KOYU metin (hem kontrast hem kimlik gerçekten "altın" görünür).
// Koyu temada üçü de aynı parlak bal tonu.
// Hue ilk sürümden (~35°) ~42°'ye kaydırıldı: turuncudan (İlerleme ~25°) ayrışsın.
export type NutrientKey = "kalori" | "protein" | "karbonhidrat" | "yağ" | "şeker" | "lif" | "sodyum";

// Bal sarısı seçildi (2026-09-24, altın/bal/zeytin yan yana karşılaştırıldı -
// ilk altın #FFB23F turuncuya yakın ve açık temada hardal kalıyordu; zeytin hedef
// yeşiliyle anlamsal çakışıyor).
const ACTIVE = {
  dark: { text: "#FFC23D", heroGradient: ["#B08012", "#654305"] as [string, string] },
  light: { text: "#9A6300", graphic: "#C98A0C", fill: "#F2B53A", onFill: "#3A2800" },
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
    ? { fill: ACTIVE.dark.text, onFill: "#2A1804" }
    : { fill: ACTIVE.light.fill, onFill: ACTIVE.light.onFill };
}

export function useCalorieOverColor(): string {
  const { theme } = useTheme();
  return theme === "dark" ? OVER_DARK : OVER_LIGHT;
}
