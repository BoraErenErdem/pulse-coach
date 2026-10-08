"use client";

import { useMemo, useState } from "react";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { exerciseDisplayName, useLanguage, useT } from "@/lib/language-context";
import { WORKOUT_TYPE_LABELS } from "@/lib/labels";
import { formatInt } from "@/lib/format";
import { formatAxisNumber } from "@/components/charts/chart-utils";
import { niceTicks, WeeklyBarsChart } from "@/components/charts/svg-charts";
import { ChartWell } from "@/components/charts/panel-parts";

// Mobil workout-type-chart.tsx + workout-volume-chart.tsx'in web karşılığı (2026-10-08): tür
// renkleri mobildeki özel palet (kuvvet = sayfanın kırmızısı, kardiyo kehribar, esneklik teal,
// karışık mor), çubuğa tıklayınca altta o türün/günün özeti. Önceden Recharts + genel seri paleti.

export const WORKOUT_TYPE_COLOR: Record<WorkoutType, string> = {
  kuvvet: "var(--wt-kuvvet)",
  kardiyo: "var(--wt-kardiyo)",
  esneklik: "var(--wt-esneklik)",
  karışık: "var(--wt-karisik)",
};

function DetailPanel({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in-up mt-3 flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2.5">{children}</div>;
}

export function WorkoutTypeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { language } = useLanguage();
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);

  const { data, stats } = useMemo(() => {
    const counts: Partial<Record<WorkoutType, number>> = {};
    const st = new Map<WorkoutType, { sets: number; volumeKg: number; durationMinutes: number; calories: number }>();
    for (const session of sessions) {
      if (!session.workout_type) continue;
      const type = session.workout_type as WorkoutType;
      counts[type] = (counts[type] ?? 0) + 1;
      const entry = st.get(type) ?? { sets: 0, volumeKg: 0, durationMinutes: 0, calories: 0 };
      for (const set of session.sets) {
        entry.sets += 1;
        if (set.weight_kg && set.reps) entry.volumeKg += set.weight_kg * set.reps;
        if (set.duration_minutes) entry.durationMinutes += set.duration_minutes;
        if (set.estimated_calories) entry.calories += set.estimated_calories;
      }
      st.set(type, entry);
    }
    const rows = (Object.keys(WORKOUT_TYPE_LABELS[language]) as WorkoutType[])
      .map((key) => ({ type: key, value: counts[key] ?? 0, label: WORKOUT_TYPE_LABELS[language][key] }))
      .filter((item) => item.value > 0);
    return { data: rows, stats: st };
  }, [sessions, language]);

  if (data.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-white/80">{t("Henüz tamamlanmış antrenman kaydı yok.", "No completed workout logged yet.")}</p>;
  }

  // Seçim yoksa en sık tür (mobil: effectiveType = mostCommon).
  const mostCommonIdx = data.reduce((best, item, i) => (item.value > data[best].value ? i : best), 0);
  const effectiveIdx = selected !== null && selected < data.length ? selected : mostCommonIdx;
  const eff = data[effectiveIdx];
  const stat = stats.get(eff.type);
  const relevant: Record<WorkoutType, ("volume" | "duration" | "calories")[]> = {
    kuvvet: ["volume"],
    kardiyo: ["duration", "calories"],
    esneklik: ["duration", "calories"],
    karışık: ["volume", "duration", "calories"],
  };
  const parts: string[] = [];
  if (stat) {
    const allowed = relevant[eff.type];
    if (allowed.includes("volume") && stat.volumeKg > 0)
      parts.push(t(`${formatInt(stat.volumeKg, language)} kg toplam hacim`, `${formatInt(stat.volumeKg, language)} kg total volume`));
    if (allowed.includes("duration") && stat.durationMinutes > 0)
      parts.push(t(`${stat.durationMinutes} dk toplam süre`, `${stat.durationMinutes} min total duration`));
    if (allowed.includes("calories") && stat.calories > 0) parts.push(`~${stat.calories.toFixed(0)} kcal`);
  }
  const max = Math.max(...data.map((d) => d.value));
  const yTicks = niceTicks(0, max * 1.15, 4).filter((v) => Number.isInteger(v));

  return (
    <div>
      <ChartWell>
        <WeeklyBarsChart
          ariaLabel={data.map((d) => `${d.label}: ${d.value}`).join(", ")}
          values={data.map((d) => d.value)}
          xLabels={data.map((d) => d.label)}
          barColors={data.map((d) => WORKOUT_TYPE_COLOR[d.type])}
          color={WORKOUT_TYPE_COLOR.kuvvet}
          domainY={[0, Math.max(yTicks[yTicks.length - 1] ?? max, max * 1.15)]}
          yTicks={yTicks}
          showValues
          outlineSelected
          maxBarWidth={44}
          height={210}
          selectedIndex={effectiveIdx}
          onSelect={(i) => setSelected(i)}
        />
      </ChartWell>
      <DetailPanel key={eff.type}>
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-900 dark:text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: WORKOUT_TYPE_COLOR[eff.type] }} aria-hidden="true" />
          {eff.label} · {t(`${stat?.sets ?? 0} set`, `${stat?.sets ?? 0} sets`)}
        </p>
        {parts.length > 0 ? <p className="text-xs text-zinc-500 dark:text-white/80">{parts.join(" · ")}</p> : null}
      </DetailPanel>
    </div>
  );
}

const EXERCISE_DISPLAY_LIMIT = 6;

export function WorkoutVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { language } = useLanguage();
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [expandedFor, setExpandedFor] = useState<number | null>(null);
  const locale = language === "en" ? "en-US" : "tr-TR";

  const points = useMemo(() => {
    const byDate = new Map<string, { volume: number; types: Set<WorkoutType>; byExercise: Map<string, number> }>();
    for (const session of sessions) {
      const vol = session.sets.reduce((sum, set) => sum + (set.weight_kg && set.reps ? set.weight_kg * set.reps : 0), 0);
      if (vol <= 0) continue;
      const entry = byDate.get(session.session_date) ?? { volume: 0, types: new Set<WorkoutType>(), byExercise: new Map<string, number>() };
      entry.volume += vol;
      if (session.workout_type) entry.types.add(session.workout_type as WorkoutType);
      for (const set of session.sets) {
        if (set.weight_kg && set.reps) {
          const name = exerciseDisplayName(set, language);
          entry.byExercise.set(name, (entry.byExercise.get(name) ?? 0) + set.weight_kg * set.reps);
        }
      }
      byDate.set(session.session_date, entry);
    }
    return Array.from(byDate.entries())
      .map(([date, e]) => ({ date, volume: e.volume, types: Array.from(e.types), byExercise: Array.from(e.byExercise.entries()).sort((a, b) => b[1] - a[1]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, language]);

  if (points.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-white/80">
        {t(
          "Henüz ağırlıklı set verisi yok. Antrenman kaydettikçe hacim trendi burada görünecek.",
          "No weighted set data yet. The volume trend will show up here as you log workouts."
        )}
      </p>
    );
  }

  const colorOf = (types: WorkoutType[]) => (types.length === 1 ? WORKOUT_TYPE_COLOR[types[0]] : WORKOUT_TYPE_COLOR.karışık);
  const usedTypes = Array.from(new Set(points.flatMap((p) => p.types)));
  const effectiveIdx = Math.min(selected ?? points.length - 1, points.length - 1);
  const sel = points[effectiveIdx];
  const expanded = expandedFor === effectiveIdx;
  const typeLabel = sel.types.length === 1 ? WORKOUT_TYPE_LABELS[language][sel.types[0]] : sel.types.length > 1 ? WORKOUT_TYPE_LABELS[language].karışık : "";
  const max = Math.max(...points.map((p) => p.volume));
  const yTicks = niceTicks(0, max * 1.1, 4);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });

  return (
    <div>
      <ChartWell>
        <WeeklyBarsChart
          ariaLabel={t("Günlük ağırlık hacmi grafiği", "Daily weight volume chart")}
          values={points.map((p) => p.volume)}
          xLabels={points.map((p, i) => ((points.length - 1 - i) % labelEvery === 0 ? shortDate(p.date) : ""))}
          barColors={points.map((p) => colorOf(p.types))}
          color={WORKOUT_TYPE_COLOR.kuvvet}
          domainY={[0, yTicks[yTicks.length - 1] ?? max]}
          yTicks={yTicks}
          formatY={(v) => formatAxisNumber(v, language)}
          gutterLeft={40}
          outlineSelected
          height={210}
          selectedIndex={effectiveIdx}
          onSelect={setSelected}
        />
      </ChartWell>
      <DetailPanel key={effectiveIdx}>
        <p className="mb-0.5 text-xs font-bold text-zinc-900 dark:text-white">
          {new Date(`${sel.date}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "long" })}
          {typeLabel ? ` · ${typeLabel}` : ""}
        </p>
        {(expanded ? sel.byExercise : sel.byExercise.slice(0, EXERCISE_DISPLAY_LIMIT)).map(([name, volume]) => (
          <div key={name} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-white/80">{name}</span>
            <span className="font-semibold text-zinc-900 dark:text-white">{volume.toFixed(0)}kg</span>
          </div>
        ))}
        {!expanded && sel.byExercise.length > EXERCISE_DISPLAY_LIMIT ? (
          <button type="button" onClick={() => setExpandedFor(effectiveIdx)} className="self-start py-1 text-xs font-semibold text-[var(--tone-accent)] hover:underline">
            {t(`+${sel.byExercise.length - EXERCISE_DISPLAY_LIMIT} egzersiz daha`, `+${sel.byExercise.length - EXERCISE_DISPLAY_LIMIT} more exercises`)}
          </button>
        ) : null}
        <div className="mt-1 flex items-center justify-between border-t border-[var(--border-subtle)] pt-1">
          <span className="text-xs font-semibold text-zinc-900 dark:text-white">{t("Toplam", "Total")}</span>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-white">{sel.volume.toFixed(0)}kg</span>
        </div>
      </DetailPanel>
      {usedTypes.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-3">
          {usedTypes.map((type) => (
            <span key={type} className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-white/80">
              <span className="h-2 w-2 rounded-full" style={{ background: WORKOUT_TYPE_COLOR[type] }} aria-hidden="true" />
              {WORKOUT_TYPE_LABELS[language][type]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
