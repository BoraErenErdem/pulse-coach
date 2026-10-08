"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Save, Target, Trophy } from "lucide-react";
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

const DAY_NAMES = {
  tr: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
} as const;

// Mobil weekly-goal.tsx::WEEKLY_GOAL_GRADIENT_DARK; tamamlanınca hedef yeşili (GOAL_DONE_GRADIENT_DARK).
const SHELL_STYLE = { "--tile-a": "#A8453A", "--tile-b": "#5C2A22", "--tile-solid-light": "#D9251C" } as React.CSSProperties;
const SHELL_DONE_STYLE = { "--tile-a": "#2F8F5B", "--tile-b": "#155A33", "--tile-solid-light": "#2E9E5B" } as React.CSSProperties;

/** Antrenman sayfasının kompakt "Haftalık Hedef" kartı - mobil weekly-goal.tsx::WeeklyGoalCard
 * (2026-10-08): başlık satırında değer + kalem, ipucu, gün daireleri. Kalem mobildeki alt sayfa
 * yerine seçiciyi kartın içinde açar. Hedef yoksa davet. `refreshKey`: kayıt eklenince tazele. */
export function WeeklyGoalPanel({ refreshKey }: { refreshKey: string }) {
  const { token } = useAuth();
  const t = useT();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const [goal, setGoal] = useState<WeeklyGoal | null>(null);
  const [editing, setEditing] = useState(false);
  const goalSetting = profile?.weekly_workout_goal_days ?? null;

  useEffect(() => {
    if (!token) return;
    getWeeklyGoal(token)
      .then(setGoal)
      .catch(() => setGoal(null));
  }, [token, refreshKey, goalSetting]);

  if (!goal) return null;

  if (goal.goal_days === null) {
    return (
      <div className="pc-panel p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-900 dark:text-zinc-50">
          <Target className="h-[18px] w-[18px] text-[var(--goal-green)]" aria-hidden="true" />
          {t("Haftalık hedef belirle", "Set a weekly goal")}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t(
            "Haftada kaç gün antrenman yapmak istediğini seç, ilerlemeni gün gün burada takip et.",
            "Choose how many days a week you want to train and track it day by day here."
          )}
        </p>
        {editing ? (
          <div className="mt-4">
            <WeeklyGoalCard embedded pickerOnly onSaved={() => setEditing(false)} />
          </div>
        ) : (
          <PrimaryButton type="button" onClick={() => setEditing(true)} className="mt-4">
            {t("Hedef Belirle", "Set Goal")}
          </PrimaryButton>
        )}
      </div>
    );
  }

  const achieved = goal.achieved;
  const goalDays = goal.goal_days ?? 0;
  const remaining = Math.max(0, goalDays - goal.done_days);
  const todayIndex = goal.days.findIndex((d) => d.day === goal.today);
  const daysLeftInWeek = todayIndex >= 0 ? 6 - todayIndex : 0;
  const todayTrained = todayIndex >= 0 && goal.days[todayIndex].trained;
  const reachable = remaining <= daysLeftInWeek + (todayTrained ? 0 : 1);
  const hint = achieved
    ? t("Bu haftanın hedefi tamamlandı, harika iş!", "This week's goal is done, great work!")
    : reachable
      ? t(
          `Hedefe ${remaining} gün kaldı · haftanın bitmesine ${daysLeftInWeek} gün var`,
          `${remaining} more ${remaining === 1 ? "day" : "days"} to go · ${daysLeftInWeek} ${daysLeftInWeek === 1 ? "day" : "days"} left this week`
        )
      : t("Bu hafta hedefe yetişmek zor ama her antrenman günü sayılır.", "The goal is out of reach this week, but every workout day still counts.");
  const letters = DAY_LETTERS[language];
  const names = DAY_NAMES[language];

  return (
    <div className="pc-tile rounded-[22px] p-[18px]" style={achieved ? SHELL_DONE_STYLE : SHELL_STYLE}>
      <div className="flex items-center gap-2.5 text-[var(--tile-text)]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tile-solid-light)_45%,transparent)] bg-[color-mix(in_srgb,var(--tile-solid-light)_18%,transparent)] text-[var(--tile-solid-light)] dark:border-white/40 dark:bg-white/15 dark:text-white">
          {achieved ? <Trophy className="h-[18px] w-[18px]" /> : <Target className="h-[18px] w-[18px]" />}
        </span>
        <h2 className="flex-1 text-lg font-semibold">{t("Haftalık Hedef", "Weekly Goal")}</h2>
        <p className="flex items-baseline gap-1">
          <span className="text-[26px] font-semibold leading-none tabular-nums">
            {goal.done_days}/{goalDays}
          </span>
          <span className="text-sm text-[var(--tile-subtle)]">{t("gün", "days")}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          aria-label={t("Haftalık hedefi düzenle", "Edit weekly goal")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--tile-subtle)] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Pencil className="h-[17px] w-[17px]" />
        </button>
      </div>
      <p className="mt-1.5 text-sm text-[var(--tile-subtle)]">{hint}</p>
      <div className="mt-3.5 flex justify-between gap-1">
        {goal.days.map((d, i) => {
          const isToday = i === todayIndex;
          const isFuture = todayIndex >= 0 && i > todayIndex;
          return (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center gap-1.5"
              role="img"
              aria-label={`${names[i]}: ${d.trained ? t("antrenman yapıldı", "worked out") : t("antrenman yok", "no workout")}${isToday ? t(" (bugün)", " (today)") : ""}`}
            >
              <span
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] ${
                  d.trained
                    ? "border-[var(--tile-solid-light)] bg-[var(--tile-solid-light)] text-white dark:border-white dark:bg-white dark:text-[var(--tile-a)]"
                    : isToday
                      ? "border-2 border-[var(--tile-solid-light)] dark:border-white"
                      : "border-[color-mix(in_srgb,var(--tile-solid-light)_55%,transparent)] dark:border-white/35"
                } ${isFuture ? "opacity-55" : ""}`}
              >
                {d.trained ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
              <span className={`text-xs ${isToday ? "font-bold text-[var(--tile-text)]" : "text-[var(--tile-subtle)]"}`}>{letters[i]}</span>
            </div>
          );
        })}
      </div>
      {editing ? (
        <div className="mt-4 rounded-2xl bg-white/70 p-4 text-zinc-900 dark:bg-black/25 dark:text-white">
          <WeeklyGoalCard embedded pickerOnly onSaved={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** `embedded`: Hedef Merkezi'nin "Antrenman" kartının içinde açılır - kart çerçevesi ve başlık
 * yok (mobilde WeeklyGoalSheet). `onSaved`: kayıttan sonra çağıranın özetini tazelemesi için. */
export function WeeklyGoalCard({
  embedded = false,
  pickerOnly = false,
  onSaved,
}: { embedded?: boolean; pickerOnly?: boolean; onSaved?: () => void } = {}) {
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
      onSaved?.();
      setSuccess(
        value === null ? t("Haftalık hedef kaldırıldı.", "Weekly goal removed.") : t("Haftalık hedef kaydedildi!", "Weekly goal saved!")
      );
    });
  }

  const letters = DAY_LETTERS[language];
  const achieved = progress?.achieved ?? false;

  const Wrapper = embedded ? "div" : Card;
  return (
    <Wrapper>
      {embedded ? null : (
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium text-zinc-900 dark:text-zinc-50">
          {achieved ? <Trophy className="h-4 w-4 text-emerald-500" /> : <Target className="h-4 w-4 text-[var(--tone-accent)]" />}
          {t("Haftalık Antrenman Hedefi", "Weekly Workout Goal")}
        </h2>
      )}
      <p className="mb-4 text-sm text-zinc-500">
        {t(
          "Haftada kaç gün antrenman yapmak istiyorsun? Aynı gün birden fazla antrenman tek gün sayılır, hafta Pazartesi başlar.",
          "How many days a week do you want to train? Multiple workouts on the same day count as one; weeks start on Monday."
        )}
      </p>

      {success ? <SuccessBanner message={success} /> : null}
      {error ? <ErrorBanner message={error} /> : null}

      {!pickerOnly && progress && progress.goal_days !== null ? (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <span className="text-[30px] font-medium tracking-[-0.5px] text-zinc-900 dark:text-zinc-50">
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
                          : "border-[var(--tone-accent)] bg-[var(--tone-fill)] text-[var(--tone-on-fill)]"
                        : isToday
                          ? "border-2 border-[var(--tone-accent)]"
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
                ? "border-[var(--tone-accent)] bg-[var(--tone-fill)] text-[var(--tone-on-fill)]"
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
    </Wrapper>
  );
}
