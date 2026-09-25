import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  getDailyNutritionSummary,
  getExerciseGoals,
  getProgressLogs,
  getWeeklyGoal,
  type DailyNutritionSummary,
  type ExerciseGoalProgress,
  type Profile,
  type ProgressLog,
  type WeeklyGoal,
} from "@/lib/api";
import { useT } from "@/lib/language-context";
import { metricGoalStatus } from "@/components/progress-charts";

// Profil > Hedef Merkezi ve Profil ana ekranındaki "Hedeflerin" özeti için TEK
// hesap (2026-09-25). Hedefler sahiplerinin sekmelerinde belirleniyor
// (İlerleme: kilo/bel/yağ, Antrenman: haftalık gün + egzersiz, Beslenme:
// kalori/makro) - burada sadece okunup aynı kurallarla değerlendiriliyor:
// - vücut: progress-charts.tsx::metricGoalStatus (İlerleme'deki GoalsCard ile aynı),
// - kalori: hedefin %90-110'u "hedefte" (nutrition-cards.tsx::NutritionHeroCard),
// - makro: hedefe ulaşınca (>= %100),
// - egzersiz: progress_pct >= 100 (exercise-goals-list.tsx).

export type GoalOwner = "progress" | "workouts" | "nutrition";

export interface GoalItem {
  key: string;
  owner: GoalOwner;
  label: string;
  /** 0-100; ilerleme hesaplanamıyorsa (ör. tek ölçüm) null. */
  pct: number | null;
  reached: boolean;
  /** "98 → 95 cm", "2/3 gün", "1.850 / 3.500 kcal" gibi kısa değer metni. */
  detail: string;
}

export interface GoalOverviewData {
  logs: ProgressLog[];
  weeklyGoal: WeeklyGoal | null;
  nutrition: DailyNutritionSummary | null;
  exerciseGoals: ExerciseGoalProgress[];
}

const fmtNum = (v: number) => String(Math.round(v * 10) / 10);
const fmtInt = (v: number) => Math.round(v).toLocaleString("tr-TR");

export function latestMetric(logs: ProgressLog[], key: "weight" | "waist_cm" | "body_fat_pct"): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const value = logs[i][key];
    if (value != null) return value;
  }
  return null;
}

export function useGoalOverview(token: string | null) {
  const t = useT();
  const [data, setData] = useState<GoalOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const [logs, weeklyGoal, nutrition, exerciseGoals] = await Promise.all([
        getProgressLogs(token, 90),
        getWeeklyGoal(token),
        getDailyNutritionSummary(token),
        getExerciseGoals(token),
      ]);
      setData({ logs, weeklyGoal, nutrition, exerciseGoals });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Hedefler yüklenemedi.", "Couldn't load goals."));
    }
  }, [token, t]);

  return { data, error, reload };
}

/** Profil + yüklenen veriden sahiplerine göre gruplanmış hedef listesi. */
export function useGoalItems(profile: Profile | null, data: GoalOverviewData | null): Record<GoalOwner, GoalItem[]> {
  const t = useT();
  return useMemo(() => {
    const groups: Record<GoalOwner, GoalItem[]> = { progress: [], workouts: [], nutrition: [] };
    if (!profile || !data) return groups;

    // ---- Vücut (İlerleme)
    const body: { key: "weight" | "waist" | "fat"; target: number | null; label: string; unit: string }[] = [
      { key: "weight", target: profile.target_weight_kg, label: t("Kilo", "Weight"), unit: "kg" },
      { key: "waist", target: profile.target_waist_cm, label: t("Bel Çevresi", "Waist"), unit: "cm" },
      { key: "fat", target: profile.target_body_fat_pct, label: t("Vücut Yağı", "Body Fat"), unit: "%" },
    ];
    for (const metric of body) {
      if (metric.target == null) continue;
      const status = metricGoalStatus(data.logs, metric.key, metric.target);
      const unitOf = (v: number) => (metric.unit === "%" ? `%${fmtNum(v)}` : `${fmtNum(v)} ${metric.unit}`);
      groups.progress.push({
        key: metric.key,
        owner: "progress",
        label: metric.label,
        pct: status?.pct ?? null,
        reached: status?.reached ?? false,
        detail: status
          ? `${metric.unit === "%" ? `%${fmtNum(status.current)}` : fmtNum(status.current)} → ${unitOf(metric.target)}`
          : t(`Hedef ${unitOf(metric.target)} · ölçüm yok`, `Goal ${unitOf(metric.target)} · no entry yet`),
      });
    }

    // ---- Antrenman
    const weekly = data.weeklyGoal;
    if (weekly?.goal_days) {
      groups.workouts.push({
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
      const detail = isDuration
        ? `${fmtNum(goal.best_duration_minutes ?? 0)} / ${fmtNum(goal.target_duration_minutes ?? 0)} ${t("dk", "min")}`
        : `${fmtNum(goal.best_weight_kg ?? 0)} / ${fmtNum(goal.target_weight_kg ?? 0)} kg` +
          (goal.target_reps != null ? ` × ${goal.target_reps}` : "");
      groups.workouts.push({
        key: `exercise-${goal.id}`,
        owner: "workouts",
        label: goal.exercise_name,
        pct: Math.min(100, goal.progress_pct),
        reached: goal.progress_pct >= 100,
        detail,
      });
    }

    // ---- Beslenme (bugün)
    const n = data.nutrition;
    if (n?.calorie_goal) {
      const ratio = n.total_calories_kcal / n.calorie_goal;
      groups.nutrition.push({
        key: "calorie",
        owner: "nutrition",
        label: t("Kalori (bugün)", "Calories (today)"),
        pct: Math.min(100, ratio * 100),
        reached: ratio >= 0.9 && ratio <= 1.1,
        detail: `${fmtInt(n.total_calories_kcal)} / ${fmtInt(n.calorie_goal)} kcal`,
      });
    }
    const macros: { key: string; goal: number | null; value: number; label: string }[] = [
      { key: "protein", goal: n?.protein_goal_g ?? null, value: n?.total_protein_g ?? 0, label: t("Protein", "Protein") },
      { key: "carbs", goal: n?.carbs_goal_g ?? null, value: n?.total_carbs_g ?? 0, label: t("Karbonhidrat", "Carbs") },
      { key: "fat", goal: n?.fat_goal_g ?? null, value: n?.total_fat_g ?? 0, label: t("Yağ", "Fat") },
    ];
    for (const macro of macros) {
      if (!macro.goal) continue;
      groups.nutrition.push({
        key: macro.key,
        owner: "nutrition",
        label: t(`${macro.label} (bugün)`, `${macro.label} (today)`),
        pct: Math.min(100, (macro.value / macro.goal) * 100),
        reached: macro.value >= macro.goal,
        detail: `${fmtInt(macro.value)} / ${fmtInt(macro.goal)} g`,
      });
    }
    return groups;
  }, [profile, data, t]);
}
