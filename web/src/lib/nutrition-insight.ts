import type { DailyNutritionSummary, MealEntry, PreferredLanguage } from "@/lib/api";
import { foodDisplayName } from "@/lib/language-context";

/** Bugünün kayıtlarından 1-2 cümlelik özet - mobile/components/nutrition-tab-parts.tsx
 * buildTodayInsight'ın web portu (2026-10-06). Backend `summary_text` kartlardaki
 * sayıları aynen tekrarlıyordu; burada YENİ bilgi var: en çok kalori getiren besin
 * ve enerjinin makrolara dağılımı. */
export function buildTodayInsight(
  todayEntries: MealEntry[],
  summary: DailyNutritionSummary,
  t: (tr: string, en: string) => string,
  language: PreferredLanguage
): string | null {
  if (todayEntries.length === 0 || summary.total_calories_kcal <= 0) return null;
  const byFood = new Map<string, number>();
  for (const entry of todayEntries) {
    const name = foodDisplayName(entry, language);
    byFood.set(name, (byFood.get(name) ?? 0) + entry.calories_kcal);
  }
  const [topName, topKcal] = [...byFood.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPct = Math.round((topKcal / summary.total_calories_kcal) * 100);
  const kcal = Math.round(topKcal).toLocaleString(language === "en" ? "en-US" : "tr-TR");
  const first =
    byFood.size > 1
      ? t(
          `En çok kalori ${topName} kaydından geldi (${kcal} kcal, %${topPct}).`,
          `Most calories came from ${topName} (${kcal} kcal, ${topPct}%).`
        )
      : t(`Bugünkü kalorinin tamamı ${topName} kaydından.`, `All of today's calories came from ${topName}.`);
  const proteinEnergy = summary.total_protein_g * 4;
  const carbsEnergy = summary.total_carbs_g * 4;
  const fatEnergy = summary.total_fat_g * 9;
  const total = proteinEnergy + carbsEnergy + fatEnergy;
  if (total <= 0) return first;
  const p = Math.round((proteinEnergy / total) * 100);
  const c = Math.round((carbsEnergy / total) * 100);
  const f = 100 - p - c;
  return `${first} ${t(
    // Yüzde eki ("%14'ü", "%67'si") okunuşa göre değişiyor - ek gerektirmeyen kalıp.
    `Makro enerji dağılımı: %${p} protein, %${c} karbonhidrat, %${f} yağ.`,
    `Macro energy split: ${p}% protein, ${c}% carbs, ${f}% fat.`
  )}`;
}
