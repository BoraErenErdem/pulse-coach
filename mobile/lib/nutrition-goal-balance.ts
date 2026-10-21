// Günlük beslenme hedefinde kalori ile makroların bağı (2026-10-21, kullanıcı kararı).
// web/src/lib/nutrition-goal-balance.ts ile BİREBİR aynı; backend kuralı
// profile_service.balance_nutrition_goals.
//
// Her an yalnız BİR alan otomatik hesaplanır:
// - Kalori serbestken bir makro değişirse kalori makrolardan hesaplanır
//   (protein/karb. 4, yağ 9 kcal/g).
// - Kullanıcı kaloriyi yazınca kalori SABİT olur (bütçe): protein ya da yağ
//   değişirse karbonhidrat, karbonhidrat değişirse yağ kalan bütçeden hesaplanır.
//   Protein hiçbir zaman kendiliğinden değişmez (kilo başına korunması gereken makro).

export type GoalKey = "calorie" | "protein" | "carbs" | "fat";
export type GoalFields = Record<GoalKey, string>;

export const GOAL_LIMITS = { calorie: 10000, macro: 1000 } as const;
// Yetişkinlerde yağın kabul gören aralığı: kalorinin %20-35'i.
export const FAT_SHARE_RANGE = { min: 0.2, max: 0.35 } as const;
// Kalori önerisinin tabanıyla aynı (calorie_recommendation_service.MIN_CALORIES);
// cinsiyet bilinmiyorsa düşük olan.
export const LOW_CALORIE_FLOOR = { female: 1200, male: 1500, unknown: 1200 } as const;
// Gram yuvarlamasından gelen birkaç kcal'lik fark tutarsızlık sayılmaz.
const MISMATCH_TOLERANCE_KCAL = 5;

export function parseGoalText(text: string, max: number): { value: number | null; invalid: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, invalid: false };
  const n = Number(trimmed.replace(",", "."));
  if (Number.isNaN(n) || n <= 0 || n > max) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function values(fields: GoalFields) {
  return {
    calorie: parseGoalText(fields.calorie, GOAL_LIMITS.calorie).value,
    protein: parseGoalText(fields.protein, GOAL_LIMITS.macro).value,
    carbs: parseGoalText(fields.carbs, GOAL_LIMITS.macro).value,
    fat: parseGoalText(fields.fat, GOAL_LIMITS.macro).value,
  };
}

export function macroCalories(fields: GoalFields): number | null {
  const v = values(fields);
  if (v.protein == null || v.carbs == null || v.fat == null) return null;
  return Math.round(v.protein * 4 + v.carbs * 4 + v.fat * 9);
}

/**
 * `edited` değişince otomatik hesaplanacak alan: kalori serbestse kalori; kalori
 * sabitse karbonhidrat değişince yağ, diğer her değişiklikte karbonhidrat.
 */
export function autoKeyFor(edited: GoalKey, calorieFixed: boolean): GoalKey {
  if (!calorieFixed && edited !== "calorie") return "calorie";
  return edited === "carbs" ? "fat" : "carbs";
}

/**
 * Kullanıcı `edited` alanını değiştirdi (yeni değer `fields` içinde). Otomatik
 * alanın yeni değerini döner; hesaplanamıyorsa (eksik alan, bütçe yetmiyor, sınır
 * dışı) null - o durumda uyarıyı `goalIssues` verir.
 */
export function balanceAfterEdit(fields: GoalFields, edited: GoalKey, calorieFixed: boolean): string | null {
  const key = autoKeyFor(edited, calorieFixed);
  if (key === "calorie") {
    const total = macroCalories(fields);
    return total !== null && total <= GOAL_LIMITS.calorie ? String(total) : null;
  }
  const v = values(fields);
  // Karbonhidrat dengelenirken yağ, yağ dengelenirken karbonhidrat sabit kalır.
  const kept = key === "carbs" ? v.fat : v.carbs;
  if (v.calorie == null || v.protein == null || kept == null) return null;
  const used = v.protein * 4 + kept * (key === "carbs" ? 9 : 4);
  const grams = Math.round((v.calorie - used) / (key === "carbs" ? 4 : 9));
  return grams > 0 && grams <= GOAL_LIMITS.macro ? String(grams) : null;
}

/**
 * "otomatik" etiketi yalnız alan gerçekten hesaplanmış değeri taşıyorsa görünür
 * (canlı test 2026-10-21: yağ boşken kalori hesaplanamadığı hâlde etiket görünüyordu).
 */
export function isAutoValueCurrent(fields: GoalFields, autoKey: GoalKey | null): boolean {
  if (autoKey === null || autoKey === "protein") return false;
  // Kalori için bir makro değişikliği, karbonhidrat için protein, yağ için karbonhidrat
  // değişikliği aynı hesabı tetikler.
  const trigger: GoalKey = autoKey === "fat" ? "carbs" : "protein";
  const expected = balanceAfterEdit(fields, trigger, autoKey !== "calorie");
  return expected !== null && expected === fields[autoKey].trim();
}

export type GoalIssue =
  // Kalori sabit ama sabit makrolar tek başına bütçeyi dolduruyor: kayıt engellenir.
  | { kind: "over_budget"; parts: "protein_fat" | "protein_carbs"; kcal: number; calorie: number }
  // Kalori ile makroların toplamı tutmuyor (ör. kayıtlı eski hedefler): yalnız bilgi.
  | { kind: "mismatch"; total: number }
  // Otomatik hesaplanan yağ sağlıklı aralığın dışında: yalnız bilgi.
  | { kind: "fat_share"; percent: number }
  // Kalori önerinin tabanının altında: yalnız bilgi, kayıt engellenmez.
  | { kind: "low_calorie"; floor: number };

export function goalIssues(
  fields: GoalFields,
  options: { calorieFixed: boolean; autoKey: GoalKey | null; sex: "female" | "male" | null }
): GoalIssue[] {
  const v = values(fields);
  const issues: GoalIssue[] = [];
  let overBudget = false;
  if (options.calorieFixed && v.calorie != null && v.protein != null) {
    if (options.autoKey === "fat" && v.carbs != null) {
      const kcal = Math.round(v.protein * 4 + v.carbs * 4);
      if (kcal >= v.calorie) issues.push({ kind: "over_budget", parts: "protein_carbs", kcal, calorie: v.calorie });
      overBudget = kcal >= v.calorie;
    } else if (options.autoKey !== "fat" && v.fat != null) {
      const kcal = Math.round(v.protein * 4 + v.fat * 9);
      if (kcal >= v.calorie) issues.push({ kind: "over_budget", parts: "protein_fat", kcal, calorie: v.calorie });
      overBudget = kcal >= v.calorie;
    }
  }
  const total = macroCalories(fields);
  if (!overBudget && total !== null && v.calorie != null && Math.abs(v.calorie - total) > MISMATCH_TOLERANCE_KCAL) {
    issues.push({ kind: "mismatch", total });
  }
  if (!overBudget && options.autoKey === "fat" && v.fat != null && v.calorie != null) {
    const share = (v.fat * 9) / v.calorie;
    if (share < FAT_SHARE_RANGE.min || share > FAT_SHARE_RANGE.max) {
      // Sınır dışı değer sınıra yuvarlanıp "%20; aralık %20-35" gibi çelişkili görünmesin.
      const percent = share < FAT_SHARE_RANGE.min ? Math.floor(share * 100) : Math.ceil(share * 100);
      issues.push({ kind: "fat_share", percent });
    }
  }
  const floor = LOW_CALORIE_FLOOR[options.sex ?? "unknown"];
  if (v.calorie != null && v.calorie < floor) issues.push({ kind: "low_calorie", floor });
  return issues;
}
