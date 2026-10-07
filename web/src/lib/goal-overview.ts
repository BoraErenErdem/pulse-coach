import type { DailyNutritionSummary, ExerciseGoalProgress, PreferredLanguage, Profile, ProgressLog, WeeklyGoal } from "@/lib/api";
import { metricGoalStatus } from "@/lib/goal-status";

// mobile/components/goal-overview.ts::useGoalItems'in web karşılığı (2026-10-07): tüm hedefler
// (vücut, haftalık antrenman, egzersiz, günlük beslenme) tek listede. Profil'deki "Hedeflerin"
// kartı ve Hedef Merkezi bunu kullanır.

export type GoalOwner = "progress" | "workouts" | "nutrition";

export interface GoalItem {
  key: string;
  owner: GoalOwner;
  label: string;
  /** 0-100; hesaplanamıyorsa (tek ölçüm) null. */
  pct: number | null;
  reached: boolean;
  /** "98 → 95 cm", "2/3 gün", "1.850 / 2.200 kcal" gibi kısa değer. */
  detail: string;
}

export interface GoalOverviewData {
  logs: ProgressLog[];
  weeklyGoal: WeeklyGoal | null;
  nutrition: DailyNutritionSummary | null;
  exerciseGoals: ExerciseGoalProgress[];
}

const fmtNum = (v: number) => String(Math.round(v * 10) / 10);

export function buildGoalItems(
  profile: Profile | null,
  data: GoalOverviewData | null,
  language: PreferredLanguage,
  t: (tr: string, en: string) => string
): GoalItem[] {
  if (!profile || !data) return [];
  const locale = language === "en" ? "en-US" : "tr-TR";
  const fmtInt = (v: number) => Math.round(v).toLocaleString(locale);
  const pctText = (v: string) => (language === "en" ? `${v}%` : `%${v}`);
  const items: GoalItem[] = [];

  const body = [
    { key: "weight" as const, target: profile.target_weight_kg, label: t("Kilo", "Weight"), unit: "kg" },
    { key: "waist" as const, target: profile.target_waist_cm, label: t("Bel Çevresi", "Waist"), unit: "cm" },
    { key: "fat" as const, target: profile.target_body_fat_pct, label: t("Vücut Yağı", "Body Fat"), unit: "%" },
  ];
  for (const metric of body) {
    if (metric.target == null) continue;
    const status = metricGoalStatus(data.logs, metric.key, metric.target);
    const unitOf = (v: number) => (metric.unit === "%" ? pctText(fmtNum(v)) : `${fmtNum(v)} ${metric.unit}`);
    items.push({
      key: metric.key,
      owner: "progress",
      label: metric.label,
      pct: status?.pct ?? null,
      reached: status?.reached ?? false,
      detail: status
        ? `${metric.unit === "%" ? pctText(fmtNum(status.current)) : fmtNum(status.current)} → ${unitOf(metric.target)}`
        : t(`Hedef ${unitOf(metric.target)} · ölçüm yok`, `Goal ${unitOf(metric.target)} · no entry yet`),
    });
  }

  const weekly = data.weeklyGoal;
  if (weekly?.goal_days) {
    items.push({
      key: "weekly",
      owner: "workouts",
      label: t("Haftalık Antrenman", "Weekly Workouts"),
      pct: Math.min(100, (weekly.done_days / weekly.goal_days) * 100),
      reached: weekly.achieved,
      detail: t(`${weekly.done_days}/${weekly.goal_days} gün`, `${weekly.done_days}/${weekly.goal_days} days`),
    });
  }
  for (const goal of data.exerciseGoals) {
    const isDuration = goal.target_duration_minutes != null;
    items.push({
      key: `exercise-${goal.id}`,
      owner: "workouts",
      label: language === "en" ? goal.exercise_name : goal.exercise_name_tr,
      pct: Math.min(100, goal.progress_pct),
      reached: goal.progress_pct >= 100,
      detail: isDuration
        ? `${fmtNum(goal.best_duration_minutes ?? 0)} / ${fmtNum(goal.target_duration_minutes ?? 0)} ${t("dk", "min")}`
        : `${fmtNum(goal.best_weight_kg ?? 0)} / ${fmtNum(goal.target_weight_kg ?? 0)} kg` + (goal.target_reps != null ? ` × ${goal.target_reps}` : ""),
    });
  }

  const n = data.nutrition;
  if (n?.calorie_goal) {
    const ratio = n.total_calories_kcal / n.calorie_goal;
    items.push({
      key: "calorie",
      owner: "nutrition",
      label: t("Kalori (bugün)", "Calories (today)"),
      pct: Math.min(100, ratio * 100),
      reached: ratio >= 0.9 && ratio <= 1.1,
      detail: `${fmtInt(n.total_calories_kcal)} / ${fmtInt(n.calorie_goal)} kcal`,
    });
  }
  const macros = [
    { key: "protein", goal: n?.protein_goal_g ?? null, value: n?.total_protein_g ?? 0, label: t("Protein", "Protein") },
    { key: "carbs", goal: n?.carbs_goal_g ?? null, value: n?.total_carbs_g ?? 0, label: t("Karbonhidrat", "Carbs") },
    { key: "fat", goal: n?.fat_goal_g ?? null, value: n?.total_fat_g ?? 0, label: t("Yağ", "Fat") },
  ];
  for (const macro of macros) {
    if (!macro.goal) continue;
    items.push({
      key: macro.key,
      owner: "nutrition",
      label: t(`${macro.label} (bugün)`, `${macro.label} (today)`),
      pct: Math.min(100, (macro.value / macro.goal) * 100),
      reached: macro.value >= macro.goal,
      detail: `${fmtInt(macro.value)} / ${fmtInt(macro.goal)} g`,
    });
  }
  return items;
}
