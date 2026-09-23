"use client";

import { useEffect, useState } from "react";
import { Check, Save, Target, Trophy } from "lucide-react";
import { getWeeklyGoal, type WeeklyGoal } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useFormSubmit } from "@/lib/use-form-submit";
import { Card, ErrorBanner, PrimaryButton, SecondaryButton, SuccessBanner } from "@/components/ui";

// Haftalık antrenman günü hedefi (2026-09-23) - mobildeki
// components/weekly-goal.tsx'in web karşılığı: 1-7 gün seçimi + bu haftanın
// (kullanıcının yerel Pzt-Paz haftası, backend X-Timezone ile hesaplıyor)
// gün gün ilerlemesi. Hedef PATCH /profile ile kaydediliyor.
const DAY_LETTERS = { tr: ["P", "S", "Ç", "P", "C", "C", "P"], en: ["M", "T", "W", "T", "F", "S", "S"] } as const;

export function WeeklyGoalCard() {
  const { token } = useAuth();
  const t = useT();
  const { language } = useLanguage();
  const { profile, updateProfile } = useProfile();
  const current = profile?.weekly_workout_goal_days ?? null;
  // Kullanıcı henüz seçim yapmadıysa profildeki mevcut hedef gösterilir.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? current;
  const [progress, setProgress] = useState<WeeklyGoal | null>(null);
  const { isSubmitting, error, success, setSuccess, submit } = useFormSubmit();

  useEffect(() => {
    if (!token) return;
    getWeeklyGoal(token)
      .then(setProgress)
      .catch(() => setProgress(null));
  }, [token, current]);

  async function save(value: number | null) {
    await submit(async () => {
      await updateProfile({ weekly_workout_goal_days: value });
      setPicked(null);
      setSuccess(
        value === null ? t("Haftalık hedef kaldırıldı.", "Weekly goal removed.") : t("Haftalık hedef kaydedildi!", "Weekly goal saved!")
      );
    });
  }

  const letters = DAY_LETTERS[language];
  const achieved = progress?.achieved ?? false;

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {achieved ? <Trophy className="h-4 w-4 text-emerald-500" /> : <Target className="h-4 w-4 text-accent" />}
        {t("Haftalık Antrenman Hedefi", "Weekly Workout Goal")}
      </h2>
      <p className="mb-4 text-sm text-zinc-500">
        {t(
          "Haftada kaç gün antrenman yapmak istiyorsun? Aynı gün birden fazla antrenman tek gün sayılır, hafta Pazartesi başlar.",
          "How many days a week do you want to train? Multiple workouts on the same day count as one; weeks start on Monday."
        )}
      </p>

      {success ? <SuccessBanner message={success} /> : null}
      {error ? <ErrorBanner message={error} /> : null}

      {progress && progress.goal_days !== null ? (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <span className="font-display text-3xl text-zinc-900 dark:text-zinc-50">
            {progress.done_days}/{progress.goal_days} <span className="text-sm text-zinc-500">{t("gün", "days")}</span>
          </span>
          <div className="flex gap-1.5" aria-label={t("Bu haftanın günleri", "This week's days")}>
            {progress.days.map((d, i) => {
              const isToday = d.day === progress.today;
              return (
                <div key={d.day} className="flex flex-col items-center gap-1">
                  <span
                    title={d.trained ? t("antrenman yapıldı", "worked out") : t("antrenman yok", "no workout")}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                      d.trained
                        ? achieved
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-accent bg-accent-solid text-on-accent-solid"
                        : isToday
                          ? "border-2 border-accent"
                          : "border-[var(--border-strong)]"
                    }`}
                  >
                    {d.trained ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className={`text-xs ${isToday ? "font-bold text-zinc-900 dark:text-zinc-50" : "text-zinc-500"}`}>
                    {letters[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t("Haftalık gün hedefi", "Weekly day goal")}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected === n}
            onClick={() => setPicked(n)}
            className={`h-10 w-10 rounded-lg border text-sm font-semibold transition-colors ${
              selected === n
                ? "border-accent bg-accent-solid text-on-accent-solid"
                : "border-[var(--border-strong)] text-zinc-700 hover:bg-[var(--surface-muted)] dark:text-zinc-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="button" onClick={() => selected !== null && save(selected)} disabled={isSubmitting || selected === null}>
          <Save className="h-4 w-4" />
          {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
        </PrimaryButton>
        {current !== null ? (
          <SecondaryButton type="button" onClick={() => save(null)} disabled={isSubmitting}>
            {t("Hedefi kaldır", "Remove goal")}
          </SecondaryButton>
        ) : null}
      </div>
    </Card>
  );
}
