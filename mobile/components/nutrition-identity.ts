import { useTheme } from "@/lib/theme-context";

// Beslenme sekmesinin kendi renk kimliği (2026-09-24 redesign) -
// [[reference-pulsecoach-design-language]] §3'teki ilke (progress-identity.ts /
// workout-identity.ts'in ikizi): sayfaya özel, tema-duyarlı, TEK paylaşımlı
// kaynak.
//
// Sayfa kimliği ALTIN/BAL (enerji = kalori): uygulamanın sıcak tayfında her
// sekme kendi basamağında - Antrenman kırmızı, İlerleme/Sohbet turuncu,
// Beslenme altın. YEŞİL BİLEREK seçilmedi: tasarım dilinde yeşil "hedef"
// rengine ayrılmış (bel kimliği de bu yüzden yeşilden pembeye çekilmişti) -
// beslenme hedefi tamamlanınca yeşile dönmesi anlamını korusun.
//
// Açık tema tonları krem zeminde (#FBF6ED) küçük metin olarak da okunacak
// şekilde seçildi (WCAG AA ~≥4.5:1, elle ölçüldü); koyu tema tonları sıcak
// kahve panelde parlak.
export type NutrientKey = "kalori" | "protein" | "karbonhidrat" | "yağ" | "şeker" | "lif" | "sodyum";

const DARK: Record<NutrientKey, string> = {
  kalori: "#FFB23F",
  protein: "#FF7A5C",
  karbonhidrat: "#5EA4FF",
  yağ: "#B98CFF",
  şeker: "#FF8CC6",
  lif: "#3FD0D8",
  sodyum: "#AEB9D0",
};

const LIGHT: Record<NutrientKey, string> = {
  kalori: "#A15F00",
  protein: "#C0392B",
  karbonhidrat: "#1F62C4",
  yağ: "#7A45C2",
  şeker: "#B8327A",
  lif: "#0A7780",
  sodyum: "#56647E",
};

/** Koyu mod kimlik kartı gradyanı (beyaz metin kontrastı için altının koyu
 * tonları) - workout-identity.ts::WORKOUT_TILE_GRADIENT_DARK ile AYNI kalıp. */
export const NUTRITION_HERO_GRADIENT_DARK: [string, string] = ["#B8741A", "#6E4209"];

/** Kalori hedefi aşılınca halka/rozet rengi - yargılayıcı kırmızı DEĞİL (§2
 * nötr yargı), sıcak mercan: "dikkat" der, "hata" demez. */
const OVER_DARK = "#FF9466";
const OVER_LIGHT = "#B4461C";

/** Besin değeri renk eşlemesi - kutular, hedef ölçerleri, geçmiş satırları ve
 * Makro Dağılımı grafiği HEP bu tek kaynaktan beslenir (2026-08-22'deki
 * "aynı besin farklı yerde farklı renk" bulgusunun kalıcı çözümü). Eski
 * `ui.tsx::useNutrientColors` (genel seriesColors'tan ödünç, 8 kavram için 6
 * renk -> iki çift aynı rengi paylaşıyordu) yerine: her besinin KENDİ rengi. */
export function useNutrientColors(): Record<NutrientKey, string> {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}

/** Sayfanın vurgu rengi (form kartı, düğmeler, seçili chip'ler) = kalori altını. */
export function useNutritionAccent(): string {
  return useNutrientColors().kalori;
}

export function useCalorieOverColor(): string {
  const { theme } = useTheme();
  return theme === "dark" ? OVER_DARK : OVER_LIGHT;
}
